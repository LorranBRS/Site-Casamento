import { api, el, formatDateLong, formatPrice, parseDate } from '/common.js';

const app = document.getElementById('app');
const slug = document.body.dataset.slug;
let justReservedId = null;

function countdownText(wedding) {
  const target = parseDate(wedding.date, wedding.time);
  const days = Math.ceil((target - new Date()) / 86_400_000);
  if (days > 1) return `Faltam ${days} dias`;
  if (days === 1) return 'Falta 1 dia';
  if (days === 0) return 'É hoje!';
  return null;
}

function reserveForm(item, wedding, close) {
  const name = el('input', { required: true, minlength: 2, maxlength: 80, placeholder: 'Seu nome', 'aria-label': 'Seu nome', autocomplete: 'name' });
  const error = el('p', { class: 'form-error', role: 'alert' });
  const submit = el('button', { class: 'primary small' }, 'Confirmar');
  const form = el(
    'form',
    {
      class: 'reserve-form',
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.textContent = '';
        try {
          await api(`/api/public/${slug}/items/${item.id}/reserve`, { method: 'POST', body: { name: name.value } });
          justReservedId = item.id;
          await load();
        } catch (failure) {
          error.textContent = failure.message;
          submit.disabled = false;
          if (failure.status === 409) setTimeout(load, 1800);
        }
      },
    },
    el('div', { class: 'reserve-row' }, name, submit, el('button', { type: 'button', class: 'ghost small', onclick: close }, 'Cancelar')),
    error,
  );
  queueMicrotask(() => name.focus());
  return form;
}

function giftCard(item, wedding) {
  const footer = el('div', { class: 'gift-footer' });
  const showButton = () => {
    footer.replaceChildren(
      el('button', { class: 'primary small', disabled: !wedding.published, onclick: () => footer.replaceChildren(reserveForm(item, wedding, showButton)) }, 'Vou presentear'),
    );
  };
  if (item.id === justReservedId) footer.append(el('span', { class: 'badge on' }, 'Reservado por você. Obrigado!'));
  else if (item.reserved) footer.append(el('span', { class: 'badge' }, 'Já reservado'));
  else showButton();

  return el(
    'li',
    { class: item.reserved ? 'gift reserved' : 'gift' },
    item.image_url && el('img', { src: item.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    el(
      'div',
      { class: 'gift-body' },
      el('h3', {}, item.name),
      item.description && el('p', { class: 'muted' }, item.description),
      item.price_cents != null && el('p', { class: 'gift-price' }, formatPrice(item.price_cents)),
      item.link_url && !item.reserved && el('a', { href: item.link_url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver na loja'),
      footer,
    ),
  );
}

function render(wedding) {
  const countdown = countdownText(wedding);
  const hero = el(
    'header',
    { class: wedding.cover_image ? 'hero has-cover' : 'hero' },
    wedding.cover_image && el('img', { class: 'hero-image', src: wedding.cover_image, alt: '', referrerpolicy: 'no-referrer' }),
    el(
      'div',
      { class: 'hero-content' },
      el('p', { class: 'eyebrow' }, 'Vamos nos casar'),
      el('h1', {}, wedding.partner1, el('span', { class: 'amp' }, ' & '), wedding.partner2),
      el('p', { class: 'hero-date' }, formatDateLong(wedding.date), wedding.time && ` às ${wedding.time.replace(':', 'h')}`),
      countdown && el('p', { class: 'countdown' }, countdown),
    ),
  );

  const mapsUrl = wedding.address && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wedding.address)}`;

  const sections = [
    !wedding.published && el('p', { class: 'draft-banner' }, 'Pré-visualização: este convite ainda não está no ar.'),
    hero,
    wedding.message && el('section', { class: 'invite-section message' }, wedding.message),
    (wedding.venue || wedding.address) &&
      el(
        'section',
        { class: 'invite-section venue' },
        el('h2', {}, 'Onde'),
        wedding.venue && el('p', { class: 'venue-name' }, wedding.venue),
        wedding.address && el('p', { class: 'muted' }, wedding.address),
        mapsUrl && el('a', { href: mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Ver no mapa'),
      ),
    wedding.items.length > 0 &&
      el(
        'section',
        { class: 'invite-section gifts' },
        el('h2', {}, 'Lista de presentes'),
        el('p', { class: 'muted' }, 'Escolha um item e reserve para que ninguém compre o mesmo. A compra é feita por você.'),
        el('ul', { class: 'gift-grid' }, wedding.items.map((item) => giftCard(item, wedding))),
      ),
  ];
  app.replaceChildren(...sections.filter(Boolean));
}

async function load() {
  try {
    render(await api(`/api/public/${slug}`));
  } catch (error) {
    app.replaceChildren(el('main', { class: 'empty-page' }, el('h1', {}, 'Não foi possível abrir o convite'), el('p', {}, error.message)));
  }
}

load();
