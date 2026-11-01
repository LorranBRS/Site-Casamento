// Gera em dist/ a demonstracao estatica publicada no GitHub Pages.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
cpSync(join(ROOT, 'public'), DIST, { recursive: true });
cpSync(join(ROOT, 'scripts', 'pages'), DIST, { recursive: true });

// O Pages serve o site em /Site-Casamento/: os caminhos precisam ser relativos
const toStatic = (html) =>
  html
    .replace(/(href|src)="\/(?!\/)/g, '$1="')
    .replaceAll('{{title}}', 'Convite de casamento')
    .replaceAll('{{description}}', 'Demonstração do convite de casamento.')
    .replace('{{og_image}}', '')
    .replace('{{slug}}', '');

const invite = toStatic(readFileSync(join(ROOT, 'views', 'convite.html'), 'utf8'));
writeFileSync(join(DIST, 'convite.html'), invite);
writeFileSync(join(DIST, 'index.html'), invite);
writeFileSync(join(DIST, 'admin.html'), toStatic(readFileSync(join(ROOT, 'views', 'admin.html'), 'utf8')));
writeFileSync(join(DIST, '404.html'), toStatic(readFileSync(join(ROOT, 'views', 'nao-encontrado.html'), 'utf8')));
writeFileSync(join(DIST, '.nojekyll'), '');

console.log(`Demonstracao gerada em ${DIST}`);
