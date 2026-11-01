import { CUSTOM_PALETTE, DEFAULT_THEME, DESIGNS, PALETTES } from '../public/themes.js';

// Cada validador devolve { value } ou { error } com a mensagem para a tela.

function text(body, field, max) {
  const raw = body?.[field];
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function validateWedding(body) {
  const value = {
    partner1: text(body, 'partner1', 80),
    partner2: text(body, 'partner2', 80),
    date: text(body, 'date', 10),
    time: text(body, 'time', 5),
    venue: text(body, 'venue', 120),
    address: text(body, 'address', 200),
    link_description: text(body, 'link_description', 200),
    message: text(body, 'message', 2000),
  };
  if (!value.partner1 || !value.partner2) return { error: 'Informe o nome das duas pessoas do casal.' };
  if (!isRealDate(value.date)) return { error: 'Informe uma data válida.' };
  if (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) return { error: 'Horário inválido.' };
  return { value };
}

export function validateItem(body) {
  const value = {
    name: text(body, 'name', 120),
    description: text(body, 'description', 500),
    image_url: text(body, 'image_url', 500),
    link_url: text(body, 'link_url', 500),
    price_cents: body?.price_cents ?? null,
  };
  if (!value.name) return { error: 'Informe o nome do item.' };
  if (value.price_cents !== null && (!Number.isInteger(value.price_cents) || value.price_cents < 0 || value.price_cents > 100_000_000)) {
    return { error: 'Preço inválido.' };
  }
  if (value.image_url && !isHttpUrl(value.image_url)) return { error: 'O link da imagem precisa começar com http:// ou https://.' };
  if (value.link_url && !isHttpUrl(value.link_url)) return { error: 'O link da loja precisa começar com http:// ou https://.' };
  return { value };
}

export function validateGuestName(body) {
  const name = text(body, 'name', 80);
  if (name.length < 2) return { error: 'Informe o seu nome.' };
  return { value: name };
}

export function validateTheme(body) {
  const { palette, design, colors } = body ?? {};
  if (palette !== CUSTOM_PALETTE && !Object.hasOwn(PALETTES, palette)) return { error: 'Paleta inválida.' };
  if (!Object.hasOwn(DESIGNS, design)) return { error: 'Design inválido.' };
  const value = { palette, design, headline: text(body, 'headline', 60), colors: {} };
  for (const key of ['bg', 'surface', 'text', 'accent']) {
    if (typeof colors?.[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colors[key])) return { error: 'Cor inválida.' };
    value.colors[key] = colors[key];
  }
  return { value };
}

export function validateRsvp(body) {
  const { value: name, error } = validateGuestName(body);
  if (error) return { error };
  if (typeof body.attending !== 'boolean') return { error: 'Informe se você vai comparecer.' };
  const guests = body.attending ? body.guests : 0;
  if (body.attending && (!Number.isInteger(guests) || guests < 1 || guests > 20)) {
    return { error: 'Informe de 1 a 20 pessoas.' };
  }
  return { value: { name, attending: body.attending ? 1 : 0, guests } };
}

export function parseTheme(stored) {
  if (!stored) return DEFAULT_THEME;
  try {
    const theme = { ...DEFAULT_THEME, ...JSON.parse(stored) };
    // Temas salvos antes do modelo atual podem citar designs que nao existem mais
    if (!Object.hasOwn(DESIGNS, theme.design)) theme.design = DEFAULT_THEME.design;
    return theme;
  } catch {
    return DEFAULT_THEME;
  }
}

// Confere o conteudo do arquivo, nao o tipo informado por quem enviou. SVG fica de fora por poder conter scripts.
export function detectImageMime(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
