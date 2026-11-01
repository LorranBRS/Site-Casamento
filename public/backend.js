// Versao com servidor. Na publicacao estatica (GitHub Pages) este arquivo e trocado
// por scripts/pages/backend.js; veja scripts/build-pages.js.
export const demoBackend = null;
export const inviteHref = (slug, preview = false) => `/c/${slug}${preview ? '?preview=1' : ''}`;
export const inviteSlugFromUrl = () => '';
