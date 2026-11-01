// Demonstracao para o GitHub Pages, que nao roda servidor: responde as mesmas rotas da API
// guardando tudo no navegador. Respostas e casamentos criados aqui ficam so neste aparelho.
import { DEFAULT_THEME, PALETTES } from './themes.js';

const KEY = 'site-casamento-demo';

export const inviteHref = (slug) => `convite.html?c=${encodeURIComponent(slug)}`;
export const inviteSlugFromUrl = () => new URLSearchParams(location.search).get('c') || 'demo';

const seed = () => ({
  nextId: 100,
  weddings: [
    {
      id: 1,
      slug: 'demo',
      partner1: 'Marina',
      partner2: 'Rafael',
      date: '2027-09-18',
      time: '16:30',
      venue: 'Sítio das Flores',
      address: 'Estrada das Flores, 100',
      link_description: 'Veja nosso convite de casamento.',
      message: 'O amor é paciente, o amor é bondoso.',
      cover_image: 'demo-capa.svg',
      published: 1,
      theme: { ...DEFAULT_THEME, palette: 'classico', colors: PALETTES.classico.colors },
      photos: [{ id: 2, url: 'demo-capa.svg' }],
      rsvps: [],
      items: [
        { id: 3, name: 'Jogo de panelas', description: 'Antiaderente, 5 peças', price_cents: 34990, image_url: '', link_url: '', reserved_by: null },
        { id: 4, name: 'Liquidificador', description: '', price_cents: 18950, image_url: '', link_url: '', reserved_by: null },
        { id: 5, name: 'Cota da lua de mel', description: 'Ajude na nossa viagem', price_cents: null, image_url: '', link_url: '', reserved_by: null },
      ],
    },
  ],
});

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? seed();
  } catch {
    return seed();
  }
}

// Sem armazenamento (ex.: janela privada) a demonstracao segue funcionando ate recarregar a pagina
let db = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (error) {
    if (error.name === 'QuotaExceededError') throw fail(400, 'A demonstração guarda poucas fotos no navegador. Exclua alguma antes de enviar outra.');
  }
}

const fail = (status, message) => Object.assign(new Error(message), { status });
const newId = () => db.nextId++;

function makeSlug(wedding) {
  const base = `${wedding.partner1}-e-${wedding.partner2}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${base}-${newId()}`;
}

const readFile = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(fail(400, 'Não foi possível ler a foto.'));
    reader.readAsDataURL(blob);
  });

const summary = (w) => ({ ...w, item_count: w.items.length, reserved_count: w.items.filter((i) => i.reserved_by).length });

async function route(path, method, body) {
  if (path === '/api/me') return { admin: true };
  if (path === '/api/login' || path === '/api/logout') return { ok: true };

  let match = path.match(/^\/api\/public\/([^/]+)(.*)$/);
  if (match) {
    const w = db.weddings.find((other) => other.slug === decodeURIComponent(match[1]));
    if (!w) throw fail(404, 'Convite não encontrado.');
    const rest = match[2];
    if (!rest) {
      const { rsvps, ...visible } = w;
      return { ...visible, published: Boolean(w.published), items: w.items.map(({ reserved_by, ...item }) => ({ ...item, reserved: reserved_by !== null })) };
    }
    if (rest === '/rsvp') {
      w.rsvps.push({ id: newId(), name: body.name, attending: body.attending ? 1 : 0, guests: body.guests, created_at: new Date().toISOString() });
      return { ok: true };
    }
    const reserve = rest.match(/^\/items\/(\d+)\/reserve$/);
    const item = reserve && w.items.find((other) => other.id === Number(reserve[1]));
    if (!item) throw fail(404, 'Item não encontrado.');
    if (item.reserved_by) throw fail(409, 'Este presente já foi reservado por outra pessoa.');
    item.reserved_by = body.name;
    return { ok: true };
  }

  if (path === '/api/admin/weddings') {
    if (method === 'GET') return db.weddings.map(summary);
    const w = { ...body, id: newId(), cover_image: '', published: 0, theme: structuredClone(DEFAULT_THEME), photos: [], rsvps: [], items: [] };
    w.slug = makeSlug(w);
    db.weddings.push(w);
    return w;
  }

  match = path.match(/^\/api\/admin\/weddings\/(\d+)(.*)$/);
  const w = match && db.weddings.find((other) => other.id === Number(match[1]));
  if (!w) throw fail(404, 'Não encontrado.');
  const rest = match[2];

  if (!rest) {
    if (method === 'GET') return w;
    if (method === 'PUT') return Object.assign(w, body);
    db.weddings = db.weddings.filter((other) => other !== w);
    return { ok: true };
  }
  if (rest === '/publish') {
    w.published = body?.published === false ? 0 : 1;
    return w;
  }
  if (rest === '/theme') return (w.theme = body);
  if (rest === '/cover') {
    w.cover_image = w.photos.find((photo) => photo.id === body?.photo_id)?.url ?? '';
    return { cover_image: w.cover_image };
  }
  if (rest === '/photos') {
    const photo = { id: newId(), url: await readFile(body) };
    w.photos.push(photo);
    return photo;
  }
  if (rest === '/items') {
    const item = { ...body, id: newId(), reserved_by: null };
    w.items.push(item);
    return item;
  }

  match = rest.match(/^\/photos\/(\d+)$/);
  if (match) {
    const photo = w.photos.find((other) => other.id === Number(match[1]));
    if (photo && w.cover_image === photo.url) w.cover_image = '';
    w.photos = w.photos.filter((other) => other !== photo);
    return { ok: true };
  }
  match = rest.match(/^\/rsvps\/(\d+)$/);
  if (match) {
    w.rsvps = w.rsvps.filter((other) => other.id !== Number(match[1]));
    return { ok: true };
  }
  match = rest.match(/^\/items\/(\d+)(\/release)?$/);
  if (match) {
    const item = w.items.find((other) => other.id === Number(match[1]));
    if (match[2]) item.reserved_by = null;
    else if (method === 'PUT') Object.assign(item, body);
    else w.items = w.items.filter((other) => other !== item);
    return item ?? { ok: true };
  }
  throw fail(404, 'Não encontrado.');
}

export async function demoBackend(path, { method = 'GET', body } = {}) {
  const result = await route(path, method, body);
  if (method !== 'GET') save();
  return structuredClone(result);
}

document.body.prepend(
  Object.assign(document.createElement('p'), {
    className: 'demo-banner',
    textContent: 'Demonstração: os dados ficam só neste aparelho.',
  }),
);
