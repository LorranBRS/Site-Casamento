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
    cover_image: text(body, 'cover_image', 500),
  };
  if (!value.partner1 || !value.partner2) return { error: 'Informe o nome das duas pessoas do casal.' };
  if (!isRealDate(value.date)) return { error: 'Informe uma data válida.' };
  if (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) return { error: 'Horário inválido.' };
  if (value.cover_image && !isHttpUrl(value.cover_image)) return { error: 'O link da foto de capa precisa começar com http:// ou https://.' };
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
