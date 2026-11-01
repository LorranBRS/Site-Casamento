import { inviteSlugFromUrl } from './backend.js';
import { api, el, formatDateLong, formatPrice, parseDate } from './common.js';
import { applyTheme } from './themes.js';

const app = document.getElementById('app');
const slug = document.body.dataset.slug || inviteSlugFromUrl();
let justReservedId = null;

// Dentro do preview do painel: mostra as cores ainda nao salvas e nao aceita respostas
const previewMode = window.parent !== window && new URLSearchParams(location.search).has('preview');
let draftTheme = null;
let wedding = null;

const canAnswer = () => wedding.published && !previewMode;

function openSheet(title, ...content) {
  const dialog = el(
    'dialog',
    { class: 'sheet', 'aria-label': title },
    el(
      'div',
      { class: 'sheet-head' },
      el('h2', {}, title),
      el('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Fechar', onclick: () => dialog.close() }, '×'),
    ),
    el('div', { class: 'sheet-body' }, content),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// ---------- Confirmar presenca ----------

function openRsvp() {
  const name = el('input', { required: true, minlength: 2, maxlength: 80, autocomplete: 'name' });
  const guests = el('input', { type: 'number', min: 1, max: 20, value: 1, required: true, inputmode: 'numeric' });
  const guestsField = el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Quantas pessoas, contando com você?'), guests);
  const error = el('p', { class: 'form-error', role: 'alert' });
  const yes = el('input', { type: 'radio', name: 'attending', checked: true, onchange: syncGuests });
  const no = el('input', { type: 'radio', name: 'attending', onchange: syncGuests });
  const submit = el('button', { class: 'primary', disabled: !canAnswer() }, canAnswer() ? 'Enviar resposta' : 'Indisponível na pré-visualização');

  function syncGuests() {
    guestsField.hidden = no.checked;
    guests.disabled = no.checked;
  }

  const form = el(
    'form',
    {
      class: 'sheet-form',
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.textContent = '';
        try {
          await api(`/api/public/${slug}/rsvp`, {
            method: 'POST',
            body: { name: name.value, attending: yes.checked, guests: yes.checked ? Number(guests.value) : 0 },
          });
          form.replaceChildren(
            el('p', { class: 'sheet-done' }, yes.checked ? 'Presença confirmada. Esperamos por você!' : 'Resposta enviada. Obrigado por avisar!'),
          );
        } catch (failure) {
          error.textContent = failure.message;
          submit.disabled = false;
        }
      },
    },
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Seu nome'), name),
    el(
      'fieldset',
      { class: 'answer-options' },
      el('legend', { class: 'field-label' }, 'Você vai ao casamento?'),
      el('label', { class: 'answer' }, yes, 'Sim, vou comparecer'),
      el('label', { class: 'answer' }, no, 'Não poderei ir'),
    ),
    guestsField,
    error,
    submit,
  );
  openSheet('Confirmar presença', form);
}

// ---------- Presentes ----------

function reserveForm(item, close, redraw) {
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
        } catch (failure) {
          if (failure.status !== 409) {
            error.textContent = failure.message;
            submit.disabled = false;
            return;
          }
        }
        wedding = await api(`/api/public/${slug}`);
        redraw();
      },
    },
    el('div', { class: 'reserve-row' }, name, submit, el('button', { type: 'button', class: 'ghost small', onclick: close }, 'Cancelar')),
    error,
  );
  queueMicrotask(() => name.focus());
  return form;
}

function giftCard(item, redraw) {
  const footer = el('div', { class: 'gift-footer' });
  const showButton = () => {
    footer.replaceChildren(
      el('button', { class: 'primary small', disabled: !canAnswer(), onclick: () => footer.replaceChildren(reserveForm(item, showButton, redraw)) }, 'Vou presentear'),
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

function openGifts() {
  const list = el('ul', { class: 'gift-grid' });
  const redraw = () => list.replaceChildren(...wedding.items.map((item) => giftCard(item, redraw)));
  redraw();
  openSheet('Lista de presentes', el('p', { class: 'muted' }, 'Escolha um item e reserve para que ninguém compre o mesmo. A compra é feita por você.'), list);
}

// ---------- Convite ----------

function actionContent(label, icon) {
  return [el('span', { class: 'action-label' }, label), el('span', { class: 'action-circle' }, el('span', { class: `icon icon-${icon}` }))];
}

function render() {
  const theme = draftTheme ?? wedding.theme;
  applyTheme(theme);
  const gallery = wedding.photos.filter((photo) => photo.url !== wedding.cover_image);
  const place = [wedding.venue, wedding.address].filter(Boolean).join(', ');
  const mapsUrl = place && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const time = wedding.time && `às ${wedding.time.replace(':', 'h')}`;
  const daysLeft = Math.ceil((parseDate(wedding.date, wedding.time) - new Date()) / 86_400_000);

  const card = el(
    'article',
    { class: wedding.cover_image ? 'invite-card has-photo' : 'invite-card' },
    wedding.cover_image && el('img', { class: 'card-photo', src: wedding.cover_image, alt: `${wedding.partner1} e ${wedding.partner2}` }),
    el('span', { class: 'ornament ornament-top', 'aria-hidden': 'true' }),
    el('span', { class: 'ornament ornament-bottom', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'card-body' },
      wedding.message && el('p', { class: 'card-quote' }, wedding.message),
      el('h1', { class: 'card-names' }, wedding.partner1, el('span', { class: 'card-and' }, ' & '), wedding.partner2),
      theme.headline && el('p', { class: 'card-headline' }, theme.headline),
      el('p', { class: 'card-date' }, formatDateLong(wedding.date), time && el('span', { class: 'card-time' }, time)),
      wedding.venue && el('p', { class: 'card-venue' }, wedding.venue),
      daysLeft > 0 && el('p', { class: 'card-countdown' }, daysLeft === 1 ? 'Falta 1 dia' : `Faltam ${daysLeft} dias`),
      el(
        'nav',
        { class: 'card-actions', 'aria-label': 'Ações do convite' },
        el('button', { type: 'button', class: 'action', onclick: openRsvp }, actionContent('Confirmar presença', 'presenca')),
        mapsUrl && el('a', { class: 'action', href: mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, actionContent('Local', 'local')),
        wedding.items.length > 0 && el('button', { type: 'button', class: 'action', onclick: openGifts }, actionContent('Presentes', 'presente')),
      ),
      el('p', { class: 'card-hint' }, 'Toque nos ícones acima para interagir'),
    ),
  );

  const sections = [
    (!wedding.published || previewMode) &&
      el('p', { class: 'draft-banner' }, wedding.published ? 'Pré-visualização: respostas desativadas.' : 'Pré-visualização: este convite ainda não está no ar.'),
    card,
    gallery.length > 0 &&
      el(
        'section',
        { class: 'card-gallery' },
        el('h2', {}, 'Nossos momentos'),
        el('ul', { class: 'photo-grid' }, gallery.map((photo) => el('li', {}, el('img', { src: photo.url, alt: 'Foto do casal', loading: 'lazy' })))),
      ),
  ];
  app.replaceChildren(...sections.filter(Boolean));
}

async function load() {
  try {
    wedding = await api(`/api/public/${slug}`);
    render();
    if (previewMode) window.parent.postMessage({ type: 'preview-ready' }, location.origin);
  } catch (error) {
    app.replaceChildren(el('div', { class: 'empty-page' }, el('h1', {}, 'Não foi possível abrir o convite'), el('p', {}, error.message)));
  }
  document.body.classList.remove('loading');
}

if (previewMode) {
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'preview-theme') return;
    draftTheme = event.data.theme;
    if (wedding) render();
  });
}

load();
