import { api, el, formatDateLong, formatPrice } from '/common.js';

const app = document.getElementById('app');

let currentEditorId = null;

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

const inviteUrl = (wedding) => `${location.origin}/c/${wedding.slug}`;

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
  if (wedding) sections.push(itemsCard(wedding), inviteCard(wedding), dangerCard(wedding));

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
    cover_image: input('cover_image', { type: 'url', maxlength: 500, placeholder: 'https://...' }),
    message: el('textarea', { name: 'message', rows: 4, maxlength: 2000, value: wedding?.message ?? '' }),
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
    field('Link da foto de capa', inputs.cover_image, 'Opcional. Endereço de uma imagem já publicada na internet.'),
    field('Mensagem do convite', inputs.message, 'Aparece na página que os convidados abrem.'),
    field('Descrição do link', inputs.link_description, 'Aparece na prévia quando o link é enviado no WhatsApp e redes sociais. Até 200 caracteres.'),
    error,
    el('button', { class: 'primary' }, wedding ? 'Salvar alterações' : 'Criar e montar a lista'),
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
    el('h2', {}, '2. Lista de presentes'),
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
  const preview = el('a', { class: 'button ghost', href: `/c/${wedding.slug}`, target: '_blank', rel: 'noopener' }, wedding.published ? 'Abrir convite' : 'Pré-visualizar');

  if (!wedding.published) {
    return el(
      'section',
      { class: 'card' },
      el('h2', {}, '3. Link do convite'),
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
    el('h2', {}, '3. Link do convite'),
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
