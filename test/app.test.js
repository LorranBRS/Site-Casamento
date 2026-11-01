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

test('logout encerra a sessao', async () => {
  await call('/api/logout', { method: 'POST' });
  assert.equal((await call('/api/admin/weddings')).status, 401);
});
