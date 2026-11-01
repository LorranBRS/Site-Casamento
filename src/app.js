import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { validateGuestName, validateItem, validateWedding } from './validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_COOKIE = 'sessao';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (value) => createHash('sha256').update(value).digest();

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function makeSlug(partner1, partner2) {
  const base = `${partner1} e ${partner2}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // O sufixo impede que alguem adivinhe o link de outro casal
  return `${base || 'casamento'}-${randomBytes(3).toString('hex')}`;
}

function rateLimiter(max, windowMs) {
  const hits = new Map();
  return {
    allow(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size > 10_000) hits.clear();
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function formatDateBr(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function createApp({ db, adminPassword, trustProxy = false }) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD nao definida');

  const inviteTemplate = readFileSync(join(ROOT, 'views', 'convite.html'), 'utf8');
  const notFoundPage = readFileSync(join(ROOT, 'views', 'nao-encontrado.html'), 'utf8');
  const loginLimiter = rateLimiter(10, 15 * 60 * 1000);
  const reserveLimiter = rateLimiter(20, 60 * 60 * 1000);

  const sql = {
    wedding: db.prepare('SELECT * FROM weddings WHERE id = ?'),
    weddingBySlug: db.prepare('SELECT * FROM weddings WHERE slug = ?'),
    weddings: db.prepare(`
      SELECT w.*, COUNT(i.id) AS item_count, COUNT(i.reserved_by) AS reserved_count
      FROM weddings w LEFT JOIN items i ON i.wedding_id = w.id
      GROUP BY w.id ORDER BY w.date, w.id`),
    insertWedding: db.prepare(`
      INSERT INTO weddings (slug, partner1, partner2, date, time, venue, address, link_description, message, cover_image)
      VALUES (:slug, :partner1, :partner2, :date, :time, :venue, :address, :link_description, :message, :cover_image)`),
    updateWedding: db.prepare(`
      UPDATE weddings SET partner1 = :partner1, partner2 = :partner2, date = :date, time = :time, venue = :venue,
        address = :address, link_description = :link_description, message = :message, cover_image = :cover_image
      WHERE id = :id`),
    setPublished: db.prepare('UPDATE weddings SET published = ? WHERE id = ?'),
    deleteWedding: db.prepare('DELETE FROM weddings WHERE id = ?'),
    items: db.prepare('SELECT * FROM items WHERE wedding_id = ? ORDER BY id'),
    item: db.prepare('SELECT * FROM items WHERE id = ? AND wedding_id = ?'),
    insertItem: db.prepare(`
      INSERT INTO items (wedding_id, name, description, price_cents, image_url, link_url)
      VALUES (:wedding_id, :name, :description, :price_cents, :image_url, :link_url)`),
    updateItem: db.prepare(`
      UPDATE items SET name = :name, description = :description, price_cents = :price_cents,
        image_url = :image_url, link_url = :link_url
      WHERE id = :id AND wedding_id = :wedding_id`),
    deleteItem: db.prepare('DELETE FROM items WHERE id = ? AND wedding_id = ?'),
    // A condicao em reserved_by garante que dois convidados nao reservem o mesmo item
    reserveItem: db.prepare(`
      UPDATE items SET reserved_by = ?, reserved_at = datetime('now')
      WHERE id = ? AND wedding_id = ? AND reserved_by IS NULL`),
    releaseItem: db.prepare('UPDATE items SET reserved_by = NULL, reserved_at = NULL WHERE id = ? AND wedding_id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)'),
    session: db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  const sessionHash = (req) => {
    const token = readCookie(req, SESSION_COOKIE);
    return token ? sha256(token).toString('hex') : null;
  };
  const isAdmin = (req) => {
    const hash = sessionHash(req);
    return Boolean(hash && sql.session.get(hash, Date.now()));
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https: http: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---------- Login ----------

  app.post('/api/login', (req, res) => {
    if (!loginLimiter.allow(req.ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!timingSafeEqual(sha256(given), sha256(adminPassword))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    loginLimiter.reset(req.ip);
    sql.purgeSessions.run(Date.now());
    const token = randomBytes(32).toString('hex');
    sql.insertSession.run(sha256(token).toString('hex'), Date.now() + SESSION_MS);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: SESSION_MS,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const hash = sessionHash(req);
    if (hash) sql.deleteSession.run(hash);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

  // ---------- Administracao ----------

  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Faça login novamente.' });
    next();
  });

  admin.param('weddingId', (req, res, next, id) => {
    req.wedding = sql.wedding.get(Number(id));
    if (!req.wedding) return res.status(404).json({ error: 'Casamento não encontrado.' });
    next();
  });

  admin.get('/weddings', (req, res) => res.json(sql.weddings.all()));

  admin.post('/weddings', (req, res) => {
    const { value, error } = validateWedding(req.body);
    if (error) return res.status(400).json({ error });
    const { lastInsertRowid } = sql.insertWedding.run({ ...value, slug: makeSlug(value.partner1, value.partner2) });
    res.status(201).json(sql.wedding.get(lastInsertRowid));
  });

  admin.get('/weddings/:weddingId', (req, res) => {
    res.json({ ...req.wedding, items: sql.items.all(req.wedding.id) });
  });

  admin.put('/weddings/:weddingId', (req, res) => {
    const { value, error } = validateWedding(req.body);
    if (error) return res.status(400).json({ error });
    sql.updateWedding.run({ ...value, id: req.wedding.id });
    res.json(sql.wedding.get(req.wedding.id));
  });

  admin.delete('/weddings/:weddingId', (req, res) => {
    sql.deleteWedding.run(req.wedding.id);
    res.json({ ok: true });
  });

  admin.post('/weddings/:weddingId/publish', (req, res) => {
    sql.setPublished.run(req.body?.published === false ? 0 : 1, req.wedding.id);
    res.json(sql.wedding.get(req.wedding.id));
  });

  admin.post('/weddings/:weddingId/items', (req, res) => {
    const { value, error } = validateItem(req.body);
    if (error) return res.status(400).json({ error });
    const { lastInsertRowid } = sql.insertItem.run({ ...value, wedding_id: req.wedding.id });
    res.status(201).json(sql.item.get(lastInsertRowid, req.wedding.id));
  });

  admin.put('/weddings/:weddingId/items/:itemId', (req, res) => {
    const { value, error } = validateItem(req.body);
    if (error) return res.status(400).json({ error });
    const { changes } = sql.updateItem.run({ ...value, id: Number(req.params.itemId), wedding_id: req.wedding.id });
    if (!changes) return res.status(404).json({ error: 'Item não encontrado.' });
    res.json(sql.item.get(Number(req.params.itemId), req.wedding.id));
  });

  admin.delete('/weddings/:weddingId/items/:itemId', (req, res) => {
    sql.deleteItem.run(Number(req.params.itemId), req.wedding.id);
    res.json({ ok: true });
  });

  admin.post('/weddings/:weddingId/items/:itemId/release', (req, res) => {
    sql.releaseItem.run(Number(req.params.itemId), req.wedding.id);
    res.json({ ok: true });
  });

  app.use('/api/admin', admin);

  // ---------- Convite publico ----------

  // Rascunhos ficam visiveis somente para o administrador (pre-visualizacao)
  const findVisibleWedding = (req) => {
    const wedding = sql.weddingBySlug.get(req.params.slug);
    return wedding && (wedding.published || isAdmin(req)) ? wedding : null;
  };

  app.get('/api/public/:slug', (req, res) => {
    const wedding = findVisibleWedding(req);
    if (!wedding) return res.status(404).json({ error: 'Convite não encontrado.' });
    res.json({
      partner1: wedding.partner1,
      partner2: wedding.partner2,
      date: wedding.date,
      time: wedding.time,
      venue: wedding.venue,
      address: wedding.address,
      message: wedding.message,
      cover_image: wedding.cover_image,
      published: Boolean(wedding.published),
      // O nome de quem reservou nao e enviado: so o casal ve no painel
      items: sql.items.all(wedding.id).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price_cents: item.price_cents,
        image_url: item.image_url,
        link_url: item.link_url,
        reserved: item.reserved_by !== null,
      })),
    });
  });

  app.post('/api/public/:slug/items/:itemId/reserve', (req, res) => {
    const wedding = sql.weddingBySlug.get(req.params.slug);
    if (!wedding?.published) return res.status(404).json({ error: 'Convite não encontrado.' });
    if (!reserveLimiter.allow(req.ip)) {
      return res.status(429).json({ error: 'Muitas reservas seguidas. Tente mais tarde.' });
    }
    const { value: name, error } = validateGuestName(req.body);
    if (error) return res.status(400).json({ error });
    const { changes } = sql.reserveItem.run(name, Number(req.params.itemId), wedding.id);
    if (!changes) return res.status(409).json({ error: 'Este presente já foi reservado por outra pessoa.' });
    res.json({ ok: true });
  });

  app.get('/c/:slug', (req, res) => {
    const wedding = findVisibleWedding(req);
    if (!wedding) return res.status(404).type('html').send(notFoundPage);

    const couple = `${wedding.partner1} & ${wedding.partner2}`;
    const description =
      wedding.link_description || `Você foi convidado para o casamento de ${couple} em ${formatDateBr(wedding.date)}.`;
    const values = {
      title: escapeHtml(`Casamento de ${couple}`),
      description: escapeHtml(description),
      og_image: wedding.cover_image ? `<meta property="og:image" content="${escapeHtml(wedding.cover_image)}">` : '',
      slug: escapeHtml(wedding.slug),
    };
    res.set('Cache-Control', 'no-store');
    res.type('html').send(inviteTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? ''));
  });

  app.get('/', (req, res) => res.redirect('/admin'));
  app.get('/admin', (req, res) => res.sendFile(join(ROOT, 'views', 'admin.html')));
  app.use(express.static(join(ROOT, 'public')));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Não encontrado.' });
    res.status(404).type('html').send(notFoundPage);
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  });

  return app;
}
