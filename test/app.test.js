import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

const PASSWORD = 'senha-de-teste';
let server;
let base;
let cookie = '';

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(auth && cookie && { Cookie: cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
};
const json = (res) => JSON.parse(res.text);

const weddingBody = {
  partner1: 'Ana',
  partner2: 'João',
  date: '2030-05-20',
  link_description: 'Venha celebrar <conosco>',
};

before(async () => {
  const app = createApp({ db: openDb(':memory:'), adminPassword: PASSWORD });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('painel exige login e recusa senha errada', async () => {
  assert.equal((await call('/api/admin/weddings')).status, 401);
  assert.equal((await call('/api/login', { method: 'POST', body: { password: 'errada' } })).status, 401);

  const ok = await call('/api/login', { method: 'POST', body: { password: PASSWORD } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Strict/i);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/weddings')).status, 200);
});

test('valida dados do casamento e do item', async () => {
  const bad = await call('/api/admin/weddings', { method: 'POST', body: { ...weddingBody, date: '2030-02-31' } });
  assert.equal(bad.status, 400);

  const wedding = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  const script = await call(`/api/admin/weddings/${wedding.id}/items`, {
    method: 'POST',
    body: { name: 'X', link_url: 'javascript:alert(1)' },
  });
  assert.equal(script.status, 400);
});

test('convite so abre depois de publicado, e reserva nao duplica', async () => {
  const wedding = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  assert.match(wedding.slug, /^ana-e-joao-[0-9a-f]{6}$/);
  const item = json(await call(`/api/admin/weddings/${wedding.id}/items`, {
    method: 'POST',
    body: { name: 'Jogo de panelas', price_cents: 35000 },
  }));

  // Rascunho: convidado nao ve, administrador pre-visualiza
  assert.equal((await call(`/c/${wedding.slug}`, { auth: false })).status, 404);
  assert.equal((await call(`/api/public/${wedding.slug}`, { auth: false })).status, 404);
  assert.equal((await call(`/c/${wedding.slug}`)).status, 200);
  const reserve = `/api/public/${wedding.slug}/items/${item.id}/reserve`;
  assert.equal((await call(reserve, { method: 'POST', body: { name: 'Bia' }, auth: false })).status, 404);

  await call(`/api/admin/weddings/${wedding.id}/publish`, { method: 'POST', body: {} });

  const page = await call(`/c/${wedding.slug}`, { auth: false });
  assert.equal(page.status, 200);
  assert.match(page.text, /Casamento de Ana &amp; João/);
  assert.match(page.text, /Venha celebrar &lt;conosco&gt;/);

  assert.equal((await call(reserve, { method: 'POST', body: { name: 'Bia' }, auth: false })).status, 200);
  assert.equal((await call(reserve, { method: 'POST', body: { name: 'Caio' }, auth: false })).status, 409);

  // Convidado sabe que esta reservado, mas nao por quem; o casal sabe
  const publicData = await call(`/api/public/${wedding.slug}`, { auth: false });
  assert.equal(json(publicData).items[0].reserved, true);
  assert.ok(!publicData.text.includes('Bia'));
  const adminData = json(await call(`/api/admin/weddings/${wedding.id}`));
  assert.equal(adminData.items[0].reserved_by, 'Bia');

  await call(`/api/admin/weddings/${wedding.id}/items/${item.id}/release`, { method: 'POST' });
  assert.equal((await call(reserve, { method: 'POST', body: { name: 'Caio' }, auth: false })).status, 200);
});

test('item de outro casamento nao pode ser reservado pelo link errado', async () => {
  const a = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  const b = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  await call(`/api/admin/weddings/${a.id}/publish`, { method: 'POST', body: {} });
  const itemB = json(await call(`/api/admin/weddings/${b.id}/items`, { method: 'POST', body: { name: 'Taças' } }));
  const res = await call(`/api/public/${a.slug}/items/${itemB.id}/reserve`, { method: 'POST', body: { name: 'Bia' }, auth: false });
  assert.equal(res.status, 409);
});

test('novo link substitui o anterior e mantem os dados', async () => {
  const wedding = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  const admin = `/api/admin/weddings/${wedding.id}`;
  await call(`${admin}/publish`, { method: 'POST', body: {} });
  await call(`${admin}/items`, { method: 'POST', body: { name: 'Taças' } });

  const renewed = json(await call(`${admin}/new-link`, { method: 'POST' }));
  assert.notEqual(renewed.slug, wedding.slug);
  assert.equal(renewed.published, 1);
  assert.equal((await call(`/c/${wedding.slug}`, { auth: false })).status, 404);
  assert.equal((await call(`/c/${renewed.slug}`, { auth: false })).status, 200);
  assert.equal(json(await call(`/api/public/${renewed.slug}`, { auth: false })).items.length, 1);

  assert.equal((await fetch(`${base}${admin}/new-link`, { method: 'POST' })).status, 401);
});

test('logout encerra a sessao', async () => {
  await call('/api/logout', { method: 'POST' });
  assert.equal((await call('/api/admin/weddings')).status, 401);
});

test('aparencia, fotos e capa', async () => {
  await call('/api/login', { method: 'POST', body: { password: PASSWORD } }).then((res) => {
    cookie = res.headers.get('set-cookie').split(';')[0];
  });
  const wedding = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  const admin = `/api/admin/weddings/${wedding.id}`;

  // Tema: padrao, recusa valores perigosos, salva e aparece para o convidado
  assert.equal(json(await call(admin)).theme.design, 'foto');
  const colors = { bg: '#000000', surface: '#111111', text: '#ffffff', accent: '#ff0000' };
  const theme = { palette: 'personalizada', design: 'floral', headline: 'Sim!', colors };
  assert.equal((await call(`${admin}/theme`, { method: 'PUT', body: { ...theme, colors: { ...colors, bg: 'red;}' } } })).status, 400);
  assert.equal((await call(`${admin}/theme`, { method: 'PUT', body: { ...theme, design: '__proto__' } })).status, 400);
  assert.equal((await call(`${admin}/theme`, { method: 'PUT', body: theme })).status, 200);

  // Upload: confere o conteudo do arquivo e exige login
  const upload = (bytes, headers = { Cookie: cookie }) =>
    fetch(`${base}${admin}/photos`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...headers }, body: bytes });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  assert.equal((await upload(jpeg, {})).status, 401);
  assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'))).status, 400);
  const photo = await (await upload(jpeg)).json();

  // Foto de rascunho so aparece para o administrador
  assert.equal((await call(photo.url, { auth: false })).status, 404);
  const asAdmin = await call(photo.url);
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers.get('content-type'), 'image/jpeg');

  await call(`${admin}/publish`, { method: 'POST', body: {} });
  assert.equal((await call(photo.url, { auth: false })).status, 200);

  await call(`${admin}/cover`, { method: 'POST', body: { photo_id: photo.id } });
  const publicData = json(await call(`/api/public/${wedding.slug}`, { auth: false }));
  assert.equal(publicData.theme.headline, 'Sim!');
  assert.equal(publicData.cover_image, photo.url);
  assert.deepEqual(publicData.photos, [photo]);
  assert.match((await call(`/c/${wedding.slug}`, { auth: false })).text, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/fotos\//);

  // Foto de outro casamento nao vira capa; excluir a capa limpa o convite
  const other = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  assert.equal((await call(`/api/admin/weddings/${other.id}/cover`, { method: 'POST', body: { photo_id: photo.id } })).status, 404);
  await call(`${admin}/photos/${photo.id}`, { method: 'DELETE' });
  assert.equal(json(await call(admin)).cover_image, '');
});

test('confirmacao de presenca', async () => {
  const wedding = json(await call('/api/admin/weddings', { method: 'POST', body: weddingBody }));
  const admin = `/api/admin/weddings/${wedding.id}`;
  const rsvp = (body) => call(`/api/public/${wedding.slug}/rsvp`, { method: 'POST', body, auth: false });

  assert.equal((await rsvp({ name: 'Bia', attending: true, guests: 2 })).status, 404);
  await call(`${admin}/publish`, { method: 'POST', body: {} });

  assert.equal((await rsvp({ name: 'Bia', attending: true, guests: 0 })).status, 400);
  assert.equal((await rsvp({ name: 'Bia', attending: 'sim', guests: 2 })).status, 400);
  assert.equal((await rsvp({ name: 'Bia', attending: true, guests: 2 })).status, 201);
  assert.equal((await rsvp({ name: 'Caio', attending: false })).status, 201);

  const { rsvps } = json(await call(admin));
  assert.deepEqual(rsvps.map((r) => [r.name, r.attending, r.guests]), [['Caio', 0, 0], ['Bia', 1, 2]]);
  assert.ok(!(await call(`/api/public/${wedding.slug}`, { auth: false })).text.includes('Caio'));

  await call(`${admin}/rsvps/${rsvps[0].id}`, { method: 'DELETE' });
  assert.equal(json(await call(admin)).rsvps.length, 1);
});
