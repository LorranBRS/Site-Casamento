import { demoBackend } from './backend.js';

// Cria elementos sempre via textContent/atributos, nunca innerHTML, para que
// nada digitado pelo usuario ou convidado seja interpretado como HTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

export async function api(path, { method = 'GET', body } = {}) {
  if (demoBackend) return demoBackend(path, { method, body });
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? 'Algo deu errado.'), { status: response.status });
  }
  return data;
}

export async function uploadBlob(path, blob) {
  if (demoBackend) return demoBackend(path, { method: 'POST', body: blob });
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? 'Não foi possível enviar a foto.'), { status: response.status });
  }
  return data;
}

export const formatPrice = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// A data vem como AAAA-MM-DD; montar com ano/mes/dia evita voltar um dia por causa do fuso
export function parseDate(date, time = '') {
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time ? time.split(':').map(Number) : [];
  return new Date(year, month - 1, day, hour, minute);
}

export const formatDateLong = (date) =>
  parseDate(date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
