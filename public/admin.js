import { inviteHref } from './backend.js';
import { api, el, formatDateLong, formatPrice, uploadBlob } from './common.js';
import { contrast, CUSTOM_PALETTE, DESIGNS, PALETTES } from './themes.js';

const app = document.getElementById('app');

let currentEditorId = null;
// Cores escolhidas e ainda nao salvas: sobrevivem quando a tela e redesenhada ao salvar um item
let themeDraft = null;
let themeJustSaved = false;

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

const inviteUrl = (wedding) => new URL(inviteHref(wedding.slug), location.href).href;

// Executa uma acao e mostra o erro na tela; sessao expirada volta para o login
async function attempt(errorBox, action) {
  errorBox.textContent = '';
  try {
    await action();
  } catch (error) {
    if (error.status === 401) return renderLogin();
    errorBox.textContent = error.message;
  }
}

const errorLine = () => el('p', { class: 'form-error', role: 'alert' });

function field(label, input, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input, hint && el('small', {}, hint));
}

function header(title, ...actions) {
  return el('header', { class: 'page-header' }, el('h1', {}, title), el('div', { class: 'actions' }, actions));
}

// ---------- Login ----------

function renderLogin() {
  const password = el('input', { type: 'password', required: true, autocomplete: 'current-password', autofocus: true });
  const error = errorLine();
  show(
    el(
      'form',
      {
        class: 'card login',
        onsubmit: (event) => {
          event.preventDefault();
          attempt(error, async () => {
            await api('/api/login', { method: 'POST', body: { password: password.value } });
            await renderList();
          });
        },
      },
      el('h1', {}, 'Painel do casamento'),
      field('Senha', password),
      error,
      el('button', { class: 'primary' }, 'Entrar'),
    ),
  );
  password.focus();
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  renderLogin();
}

// ---------- Lista de casamentos ----------

async function renderList() {
  currentEditorId = null;
  const weddings = await api('/api/admin/weddings');
  const logoutButton = el('button', { class: 'ghost', onclick: logout }, 'Sair');
  const newButton = el('button', { class: 'primary', onclick: () => renderEditor(null) }, 'Novo casamento');

  const list = weddings.length
    ? el(
        'ul',
        { class: 'wedding-list' },
        weddings.map((wedding) =>
          el(
            'li',
            {},
            el(
              'button',
              { class: 'wedding-row', onclick: () => renderEditor(wedding.id) },
              el(
                'span',
                { class: 'wedding-row-main' },
                el('strong', {}, `${wedding.partner1} & ${wedding.partner2}`),
                el('span', { class: 'muted' }, formatDateLong(wedding.date)),
              ),
              el('span', { class: 'muted' }, `${wedding.reserved_count} de ${wedding.item_count} reservados`),
              el('span', { class: wedding.published ? 'badge on' : 'badge' }, wedding.published ? 'Publicado' : 'Rascunho'),
            ),
          ),
        ),
      )
    : el(
        'div',
        { class: 'card empty' },
        el('p', {}, 'Nenhum casamento ainda. Crie o primeiro para montar a lista e gerar o convite.'),
      );

  show(header('Casamentos', logoutButton, newButton), list);
}

// ---------- Editor ----------

async function renderEditor(id) {
  const wedding = id ? await api(`/api/admin/weddings/${id}`) : null;
  const back = el('button', { class: 'ghost', onclick: () => renderList().catch(handleFatal) }, 'Voltar');
  const title = wedding ? `${wedding.partner1} & ${wedding.partner2}` : 'Novo casamento';

  const sections = [detailsCard(wedding)];
  if (wedding) sections.push(appearanceCard(wedding), photosCard(wedding), itemsCard(wedding), rsvpCard(wedding), inviteCard(wedding), dangerCard(wedding));

  // Ao salvar um item a tela e redesenhada: mantem a rolagem no mesmo casamento
  const scroll = id && id === currentEditorId ? window.scrollY : 0;
  currentEditorId = id;
  show(header(title, back), ...sections);
  window.scrollTo(0, scroll);
}

function detailsCard(wedding) {
  const input = (name, attrs = {}) => el('input', { name, value: wedding?.[name] ?? '', ...attrs });
  const error = errorLine();
  const inputs = {
    partner1: input('partner1', { required: true, maxlength: 80 }),
    partner2: input('partner2', { required: true, maxlength: 80 }),
    date: input('date', { type: 'date', required: true }),
    time: input('time', { type: 'time' }),
    venue: input('venue', { maxlength: 120 }),
    address: input('address', { maxlength: 200 }),
    message: el('textarea', { name: 'message', rows: 4, maxlength: 300, value: wedding?.message ?? '' }),
    link_description: el('textarea', { name: 'link_description', rows: 2, maxlength: 200, value: wedding?.link_description ?? '' }),
  };

  return el(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const body = Object.fromEntries(Object.entries(inputs).map(([key, node]) => [key, node.value]));
        attempt(error, async () => {
          const saved = wedding
            ? await api(`/api/admin/weddings/${wedding.id}`, { method: 'PUT', body })
            : await api('/api/admin/weddings', { method: 'POST', body });
          await renderEditor(saved.id);
        });
      },
    },
    el('h2', {}, '1. Casal e cerimônia'),
    el(
      'div',
      { class: 'grid-2' },
      field('Nome da pessoa 1', inputs.partner1),
      field('Nome da pessoa 2', inputs.partner2),
      field('Data', inputs.date),
      field('Horário', inputs.time),
      field('Local', inputs.venue),
      field('Endereço', inputs.address),
    ),
    field('Frase ou versículo', inputs.message, 'Aparece no topo do convite. Prefira um texto curto para caber na tela do celular.'),
    field('Descrição do link', inputs.link_description, 'Aparece na prévia quando o link é enviado no WhatsApp e redes sociais. Até 200 caracteres.'),
    error,
    el('button', { class: 'primary' }, wedding ? 'Salvar alterações' : 'Criar e montar a lista'),
  );
}

function appearanceCard(wedding) {
  const saved = themeDraft?.id === wedding.id ? themeDraft.theme : wedding.theme;
  const theme = structuredClone(saved);
  const error = errorLine();
  const status = el('span', { class: 'muted', role: 'status' });
  const warning = el('p', { class: 'form-warning' });
  const colorLabels = { bg: 'Fundo', surface: 'Cartões', text: 'Texto', accent: 'Destaque' };

  const colorInputs = Object.fromEntries(
    Object.keys(colorLabels).map((key) => [
      key,
      el('input', {
        type: 'color',
        class: 'color-input',
        value: theme.colors[key],
        oninput: (event) => {
          theme.palette = CUSTOM_PALETTE;
          theme.colors[key] = event.target.value;
          sync();
        },
      }),
    ]),
  );

  const paletteButtons = Object.entries(PALETTES).map(([key, palette]) => {
    const swatches = el('span', { class: 'swatches', 'aria-hidden': 'true' }, Object.values(palette.colors).map((color) => {
      const swatch = el('span', { class: 'swatch' });
      swatch.style.background = color;
      return swatch;
    }));
    return [key, el('button', {
      type: 'button',
      class: 'choice',
      onclick: () => {
        theme.palette = key;
        theme.colors = { ...palette.colors };
        sync();
      },
    }, swatches, el('span', {}, palette.label))];
  });

  const designButtons = Object.entries(DESIGNS).map(([key, design]) => [key, el('button', {
    type: 'button',
    class: 'choice choice-design',
    onclick: () => {
      theme.design = key;
      sync();
    },
  }, el('strong', {}, design.label), el('small', { class: 'muted' }, design.hint))]);

  const headline = el('input', {
    maxlength: 60,
    value: theme.headline,
    oninput: () => {
      theme.headline = headline.value;
      sync();
    },
  });

  function sync() {
    themeDraft = { id: wedding.id, theme };
    status.textContent = '';
    for (const [key, button] of paletteButtons) button.setAttribute('aria-pressed', String(theme.palette === key));
    for (const [key, button] of designButtons) button.setAttribute('aria-pressed', String(theme.design === key));
    for (const [key, node] of Object.entries(colorInputs)) node.value = theme.colors[key];
    const readable = contrast(theme.colors.text, theme.colors.bg) >= 4.5 && contrast(theme.colors.text, theme.colors.surface) >= 4.5;
    warning.textContent = readable ? '' : 'Atenção: o texto pode ficar difícil de ler com essas cores.';
  }
  sync();
  if (themeJustSaved) status.textContent = 'Aparência salva.';
  themeJustSaved = false;
  themeDraft = themeDraft?.id === wedding.id && saved !== wedding.theme ? themeDraft : null;

  return el(
    'section',
    { class: 'card' },
    el('h2', {}, '2. Aparência do convite'),
    field('Texto do convite', headline, 'Aparece abaixo dos nomes. Deixe em branco para não mostrar.'),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Paleta de cores'), el('div', { class: 'choice-grid' }, paletteButtons.map(([, button]) => button))),
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field-label' }, 'Cores personalizadas'),
      el('div', { class: 'color-row' }, Object.entries(colorLabels).map(([key, label]) => el('label', { class: 'color-field' }, colorInputs[key], label))),
      warning,
    ),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Design'), el('div', { class: 'choice-grid' }, designButtons.map(([, button]) => button))),
    error,
    el(
      'div',
      { class: 'actions start' },
      el('button', { type: 'button', class: 'ghost', onclick: () => openPreview(wedding, theme) }, 'Ver preview'),
      el('button', {
        type: 'button',
        class: 'primary',
        onclick: () => attempt(error, async () => {
          await api(`/api/admin/weddings/${wedding.id}/theme`, { method: 'PUT', body: theme });
          themeDraft = null;
          themeJustSaved = true;
          await renderEditor(wedding.id);
        }),
      }, 'Salvar aparência'),
      status,
    ),
  );
}

function openPreview(wedding, theme) {
  const frame = el('iframe', { class: 'preview-frame', title: 'Preview do convite', src: inviteHref(wedding.slug, true) });
  frame.classList.add('phone');
  const sizeButton = (label, phone) => el('button', {
    type: 'button',
    class: 'ghost small',
    onclick: () => frame.classList.toggle('phone', phone),
  }, label);
  const dialog = el(
    'dialog',
    { class: 'preview-dialog' },
    el(
      'div',
      { class: 'preview-bar' },
      el('strong', {}, 'Preview do convite'),
      el(
        'div',
        { class: 'actions' },
        sizeButton('Computador', false),
        sizeButton('Celular', true),
        el('button', { type: 'button', class: 'primary small', onclick: () => dialog.close() }, 'Fechar'),
      ),
    ),
    el('div', { class: 'preview-stage' }, frame),
  );

  const onMessage = (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'preview-ready') return;
    frame.contentWindow.postMessage({ type: 'preview-theme', theme: structuredClone(theme) }, location.origin);
  };
  window.addEventListener('message', onMessage);
  dialog.addEventListener('close', () => {
    window.removeEventListener('message', onMessage);
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
}

// Reduz a foto no navegador: fotos de celular costumam passar do limite de envio
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = el('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a foto.'))), 'image/jpeg', 0.85);
  });
}

function photosCard(wedding) {
  const error = errorLine();
  const status = el('span', { class: 'muted', role: 'status' });
  const grid = el('ul', { class: 'admin-photos' });
  const base = `/api/admin/weddings/${wedding.id}`;

  function draw() {
    grid.replaceChildren(
      ...wedding.photos.map((photo) => {
        const isCover = wedding.cover_image === photo.url;
        return el(
          'li',
          { class: 'admin-photo' },
          el('img', { src: photo.url, alt: '' }),
          isCover && el('span', { class: 'badge on cover-badge' }, 'Capa'),
          el(
            'div',
            { class: 'actions start' },
            el('button', {
              type: 'button',
              class: 'ghost small',
              onclick: () => attempt(error, async () => {
                const { cover_image } = await api(`${base}/cover`, { method: 'POST', body: { photo_id: isCover ? null : photo.id } });
                wedding.cover_image = cover_image;
                draw();
              }),
            }, isCover ? 'Tirar da capa' : 'Usar como capa'),
            el('button', {
              type: 'button',
              class: 'ghost small danger',
              onclick: () => {
                if (!confirm('Excluir esta foto?')) return;
                attempt(error, async () => {
                  await api(`${base}/photos/${photo.id}`, { method: 'DELETE' });
                  wedding.photos = wedding.photos.filter((other) => other.id !== photo.id);
                  if (isCover) wedding.cover_image = '';
                  draw();
                });
              },
            }, 'Excluir'),
          ),
        );
      }),
    );
  }
  draw();

  const fileInput = el('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    class: 'file-input',
    onchange: () => attempt(error, async () => {
      const files = [...fileInput.files];
      try {
        for (const [index, file] of files.entries()) {
          status.textContent = `Enviando ${index + 1} de ${files.length}...`;
          let blob;
          try {
            blob = await shrinkImage(file);
          } catch {
            throw new Error(`Não foi possível abrir "${file.name}". Use uma foto JPG, PNG ou WebP.`);
          }
          wedding.photos.push(await uploadBlob(`${base}/photos`, blob));
          draw();
        }
      } finally {
        status.textContent = '';
        fileInput.value = '';
      }
    }),
  });

  return el(
    'section',
    { class: 'card' },
    el('h2', {}, '3. Fotos'),
    el('p', { class: 'muted' }, 'A foto de capa é o fundo do convite (no design floral, fica em um círculo). As demais aparecem em uma galeria abaixo. Até 30 fotos.'),
    grid,
    error,
    el('div', { class: 'actions start' }, el('label', { class: 'button primary' }, 'Adicionar fotos', fileInput), status),
  );
}

function itemForm(wedding, item, onDone) {
  const name = el('input', { required: true, maxlength: 120, value: item?.name ?? '' });
  const price = el('input', {
    type: 'number',
    min: 0,
    step: '0.01',
    placeholder: '0,00',
    value: item?.price_cents != null ? (item.price_cents / 100).toFixed(2) : '',
  });
  const description = el('input', { maxlength: 500, value: item?.description ?? '' });
  const image = el('input', { type: 'url', maxlength: 500, placeholder: 'https://...', value: item?.image_url ?? '' });
  const link = el('input', { type: 'url', maxlength: 500, placeholder: 'https://...', value: item?.link_url ?? '' });
  const error = errorLine();

  return el(
    'form',
    {
      class: 'item-form',
      onsubmit: (event) => {
        event.preventDefault();
        const body = {
          name: name.value,
          description: description.value,
          image_url: image.value,
          link_url: link.value,
          price_cents: price.value === '' ? null : Math.round(Number(price.value) * 100),
        };
        const base = `/api/admin/weddings/${wedding.id}/items`;
        attempt(error, async () => {
          if (item) await api(`${base}/${item.id}`, { method: 'PUT', body });
          else await api(base, { method: 'POST', body });
          await onDone();
        });
      },
    },
    el(
      'div',
      { class: 'grid-2' },
      field('Item', name),
      field('Preço (R$)', price),
      field('Descrição', description),
      field('Link da imagem', image),
      field('Link da loja', link),
    ),
    error,
    el(
      'div',
      { class: 'actions' },
      item && el('button', { type: 'button', class: 'ghost', onclick: onDone }, 'Cancelar'),
      el('button', { class: 'primary' }, item ? 'Salvar item' : 'Adicionar item'),
    ),
  );
}

function itemsCard(wedding) {
  const card = el('section', { class: 'card', id: 'itens' });
  const reload = () => renderEditor(wedding.id);
  const error = errorLine();
  const base = `/api/admin/weddings/${wedding.id}/items`;

  const row = (item) => {
    const line = el(
      'li',
      { class: 'item-row' },
      el(
        'div',
        { class: 'item-row-main' },
        el('strong', {}, item.name),
        item.price_cents != null && el('span', { class: 'muted' }, formatPrice(item.price_cents)),
        item.reserved_by
          ? el('span', { class: 'badge on' }, `Reservado por ${item.reserved_by}`)
          : el('span', { class: 'badge' }, 'Disponível'),
      ),
      el(
        'div',
        { class: 'actions' },
        item.reserved_by &&
          el(
            'button',
            {
              class: 'ghost small',
              onclick: () => attempt(error, async () => {
                await api(`${base}/${item.id}/release`, { method: 'POST' });
                await reload();
              }),
            },
            'Liberar',
          ),
        el('button', { class: 'ghost small', onclick: () => line.replaceChildren(itemForm(wedding, item, reload)) }, 'Editar'),
        el(
          'button',
          {
            class: 'ghost small danger',
            onclick: () => {
              if (!confirm(`Excluir "${item.name}"?`)) return;
              attempt(error, async () => {
                await api(`${base}/${item.id}`, { method: 'DELETE' });
                await reload();
              });
            },
          },
          'Excluir',
        ),
      ),
    );
    return line;
  };

  card.append(
    el('h2', {}, '4. Lista de presentes'),
    wedding.items.length
      ? el('ul', { class: 'item-list' }, wedding.items.map(row))
      : el('p', { class: 'muted' }, 'A lista ainda está vazia. Adicione o primeiro item abaixo.'),
    error,
    el('h3', {}, 'Novo item'),
    itemForm(wedding, null, reload),
  );
  return card;
}

function inviteCard(wedding) {
  const error = errorLine();
  const setPublished = (published) =>
    attempt(error, async () => {
      await api(`/api/admin/weddings/${wedding.id}/publish`, { method: 'POST', body: { published } });
      await renderEditor(wedding.id);
    });
  const preview = el('a', { class: 'button ghost', href: inviteHref(wedding.slug), target: '_blank', rel: 'noopener' }, wedding.published ? 'Abrir convite' : 'Pré-visualizar');

  if (!wedding.published) {
    return el(
      'section',
      { class: 'card' },
      el('h2', {}, '6. Link do convite'),
      el('p', { class: 'muted' }, 'Quando a lista estiver pronta, gere o link para enviar aos convidados.'),
      error,
      el('div', { class: 'actions start' }, el('button', { class: 'primary', onclick: () => setPublished(true) }, 'Gerar link do convite'), preview),
    );
  }

  const url = inviteUrl(wedding);
  const linkInput = el('input', { readonly: true, value: url, 'aria-label': 'Link do convite', onfocus: (event) => event.target.select() });
  const copyButton = el(
    'button',
    {
      class: 'primary',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(url);
          copyButton.textContent = 'Copiado!';
          setTimeout(() => { copyButton.textContent = 'Copiar link'; }, 2000);
        } catch {
          linkInput.select();
          error.textContent = 'Não foi possível copiar automaticamente. O link está selecionado: copie com Ctrl+C.';
        }
      },
    },
    'Copiar link',
  );
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Você foi convidado para o nosso casamento! ${url}`)}`;

  return el(
    'section',
    { class: 'card' },
    el('h2', {}, '6. Link do convite'),
    el('div', { class: 'link-box' }, linkInput, copyButton),
    error,
    el(
      'div',
      { class: 'actions start' },
      el('a', { class: 'button ghost', href: whatsapp, target: '_blank', rel: 'noopener' }, 'Enviar no WhatsApp'),
      preview,
      el('button', { class: 'ghost danger', onclick: () => setPublished(false) }, 'Tirar do ar'),
    ),
  );
}

function rsvpCard(wedding) {
  const error = errorLine();
  const going = wedding.rsvps.filter((rsvp) => rsvp.attending);
  const people = going.reduce((total, rsvp) => total + rsvp.guests, 0);
  const declined = wedding.rsvps.length - going.length;

  return el(
    'section',
    { class: 'card' },
    el('h2', {}, '5. Confirmações de presença'),
    wedding.rsvps.length
      ? [
          el('p', {}, el('strong', {}, `${people} ${people === 1 ? 'pessoa confirmada' : 'pessoas confirmadas'}`), el('span', { class: 'muted' }, ` · ${declined} não ${declined === 1 ? 'poderá' : 'poderão'} ir`)),
          el(
            'ul',
            { class: 'item-list' },
            wedding.rsvps.map((rsvp) =>
              el(
                'li',
                { class: 'item-row' },
                el(
                  'div',
                  { class: 'item-row-main' },
                  el('strong', {}, rsvp.name),
                  el('span', { class: rsvp.attending ? 'badge on' : 'badge' }, rsvp.attending ? `Vai · ${rsvp.guests} ${rsvp.guests === 1 ? 'pessoa' : 'pessoas'}` : 'Não vai'),
                ),
                el('button', {
                  class: 'ghost small danger',
                  onclick: () => {
                    if (!confirm(`Excluir a resposta de ${rsvp.name}?`)) return;
                    attempt(error, async () => {
                      await api(`/api/admin/weddings/${wedding.id}/rsvps/${rsvp.id}`, { method: 'DELETE' });
                      await renderEditor(wedding.id);
                    });
                  },
                }, 'Excluir'),
              ),
            ),
          ),
        ]
      : el('p', { class: 'muted' }, 'As respostas dos convidados aparecem aqui.'),
    error,
  );
}

function dangerCard(wedding) {
  const error = errorLine();
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, 'Excluir casamento'),
    el('p', { class: 'muted' }, 'Apaga o convite, a lista e as reservas. Não dá para desfazer.'),
    error,
    el(
      'button',
      {
        class: 'ghost danger',
        onclick: () => {
          if (!confirm(`Excluir o casamento de ${wedding.partner1} & ${wedding.partner2}?`)) return;
          attempt(error, async () => {
            await api(`/api/admin/weddings/${wedding.id}`, { method: 'DELETE' });
            await renderList();
          });
        },
      },
      'Excluir casamento',
    ),
  );
}

function handleFatal(error) {
  if (error.status === 401) return renderLogin();
  show(el('div', { class: 'card empty' }, el('p', {}, error.message)));
}

api('/api/me')
  .then(({ admin }) => (admin ? renderList() : renderLogin()))
  .catch(handleFatal);
