import { createApp } from './src/app.js';
import { openDb } from './src/db.js';

const { ADMIN_PASSWORD, PORT = 3000, DB_PATH = 'data/casamento.db', TRUST_PROXY } = process.env;

if (!ADMIN_PASSWORD) {
  console.error('Defina ADMIN_PASSWORD: copie .env.example para .env e escolha uma senha.');
  process.exit(1);
}

const app = createApp({
  db: openDb(DB_PATH),
  adminPassword: ADMIN_PASSWORD,
  trustProxy: TRUST_PROXY === '1',
});

app.listen(PORT, () => console.log(`Painel em http://localhost:${PORT}/admin`));
