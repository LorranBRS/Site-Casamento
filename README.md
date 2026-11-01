# Site Casamento

Painel para criar a lista de presentes do casamento e gerar o link de convite para os convidados.

## Como rodar

Precisa do Node.js 22.13 ou mais novo.

```bash
npm install
cp .env.example .env   # depois troque a senha em ADMIN_PASSWORD
npm start
```

- Painel: <http://localhost:3000/admin>
- Convite: `/c/<link-do-casal>`, gerado no painel

Os dados ficam em `data/casamento.db` (SQLite). Faça backup dessa pasta.

## Testes

```bash
npm test
```

## Colocar no ar

Para os convidados abrirem o link, o site precisa estar em um servidor com disco persistente e HTTPS.
Defina `ADMIN_PASSWORD` e `TRUST_PROXY=1` no servidor.

## Demonstração no GitHub Pages

O GitHub Pages só hospeda arquivos estáticos e não roda o servidor. Por isso, cada push na branch `main`
publica uma demonstração gerada por `npm run build:pages`, que guarda os dados no navegador de quem a abre.
Ela serve para avaliar o visual e o funcionamento, mas não para receber respostas reais de convidados.
