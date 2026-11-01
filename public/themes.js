// Usado pelo painel, pelo convite e pela validacao no servidor: nao acessar o DOM no topo do arquivo.

export const PALETTES = {
  classico: { label: 'Clássico', colors: { bg: '#faf6f0', surface: '#ffffff', text: '#2f2a26', accent: '#7c5a3c' } },
  rose: { label: 'Rosé', colors: { bg: '#fdf4f3', surface: '#ffffff', text: '#3d2a2c', accent: '#b0566a' } },
  oliva: { label: 'Verde oliva', colors: { bg: '#f6f6ee', surface: '#ffffff', text: '#2c3024', accent: '#5f6f3a' } },
  sereno: { label: 'Azul sereno', colors: { bg: '#f2f6f9', surface: '#ffffff', text: '#22303c', accent: '#3b6a8f' } },
  terracota: { label: 'Terracota', colors: { bg: '#fbf3ec', surface: '#ffffff', text: '#3a2820', accent: '#b0532f' } },
  noite: { label: 'Noite', colors: { bg: '#1c1f2b', surface: '#282c3b', text: '#f3efe6', accent: '#d4b26a' } },
};

export const CUSTOM_PALETTE = 'personalizada';

export const DESIGNS = {
  foto: { label: 'Foto em tela cheia', hint: 'Foto de fundo com letras claras' },
  clara: { label: 'Foto clara', hint: 'Foto suave com letras escuras' },
  floral: { label: 'Moldura floral', hint: 'Fundo claro, ornamentos e foto redonda' },
};

export const DEFAULT_THEME = {
  palette: 'classico',
  colors: PALETTES.classico.colors,
  design: 'foto',
  headline: 'Convidam para a cerimônia de seu casamento',
};

function luminance(hex) {
  const channel = (start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function applyTheme(theme) {
  const root = document.documentElement.style;
  const { bg, surface, text, accent } = theme.colors;
  root.setProperty('--bg', bg);
  root.setProperty('--surface', surface);
  root.setProperty('--text', text);
  root.setProperty('--accent', accent);
  root.setProperty('--accent-text', contrast(accent, '#ffffff') >= contrast(accent, '#000000') ? '#ffffff' : '#000000');
  root.setProperty('color-scheme', luminance(bg) < 0.2 ? 'dark' : 'light');

  for (const key of Object.keys(DESIGNS)) document.body.classList.remove(`design-${key}`);
  document.body.classList.add(`design-${DESIGNS[theme.design] ? theme.design : DEFAULT_THEME.design}`);
}
