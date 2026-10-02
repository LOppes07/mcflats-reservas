# MC Flats — Painel Administrativo

Painel self-hosted para o cliente **cadastrar imóveis, trocar fotos, bloquear datas, gerenciar usuários e editar as informações do site** — sem depender de nenhum serviço externo. Roda inteiro na VPS.

```
painel-admin/
├── server/   → API + banco (Node + Fastify + SQLite). Porta interna 8092.
└── web/      → Painel (React + Vite). Estático, servido pelo nginx.
```

O **site público** (`../site-app`) passou a ler os imóveis e as configurações desta API
(`/api/public/*`), com *fallback* para os dados embutidos — se a API cair, o site não quebra.

---

## Papéis de acesso (hierarquia)

| Papel | Pode |
|---|---|
| **Super Admin** | Tudo: usuários, imóveis, fotos, bloqueios, configurações, auditoria |
| **Gerente** | Imóveis, fotos, bloqueios e configurações. **Não** gerencia usuários |
| **Corretor** | Edita **apenas os imóveis atribuídos a ele** (e suas fotos/bloqueios) |
| **Recepção** | Apenas reservas / bloqueios de datas |

---

## Rodar localmente (desenvolvimento)

Requisito: **Node ≥ 22.5** (o banco usa o SQLite embutido do Node, sem compilar nada).

```bash
# 1) API
cd server
cp .env.example .env          # ajuste o JWT_SECRET e as credenciais do 1º admin
npm install
npm run dev                   # sobe em http://localhost:8092 e cria o banco + seed

# 2) Painel (noutro terminal)
cd web
npm install
npm run dev                   # http://localhost:5174  (faz proxy de /api para a :8092)
```

Login inicial (definido no `.env`, seção `SEED_ADMIN_*`):
`admin@mcflats.com.br` / `mcflats2026` — **troque a senha no primeiro acesso.**

O banco e as fotos ficam em `server/data/` (`mcflats.sqlite` + `uploads/`). Para zerar tudo,
apague a pasta `server/data/` e reinicie a API.

---

## Deploy na VPS (nginx + PM2)

Arquitetura: a API roda como serviço interno (PM2, porta 8092). O nginx serve os arquivos
estáticos do painel e do site, e faz *proxy* de `/api` e `/uploads` para a API. Assim tudo é
*same-origin* e o cookie de sessão funciona com `sameSite=lax`.

### 1. API

```bash
cd server
cp .env.example .env
#  → defina um JWT_SECRET forte:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#  → COOKIE_SECURE=true   (produção com HTTPS)
#  → SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD do dono
npm ci --omit=dev
pm2 start src/server.js --name mcflats-api
pm2 save
```

### 2. Painel (admin.mcflats.com.br)

```bash
cd web
npm ci && npm run build          # gera web/dist
# copie web/dist para /var/www/mcflats-admin
```

nginx:

```nginx
server {
  server_name admin.mcflats.com.br;
  root /var/www/mcflats-admin;
  index index.html;

  location / { try_files $uri /index.html; }         # SPA

  location /api      { proxy_pass http://127.0.0.1:8092; proxy_set_header Host $host; }
  location /uploads  { proxy_pass http://127.0.0.1:8092; }
}
```

### 3. Site público (mcflats.com.br) lendo a API

No nginx do site público, além de servir o `site-app/dist`, encaminhe as rotas públicas
para a mesma API:

```nginx
server {
  server_name mcflats.com.br;
  root /var/www/mcflats;
  index index.html;

  location / { try_files $uri /index.html; }

  location /api/public { proxy_pass http://127.0.0.1:8092; }   # só as rotas públicas
  location /uploads    { proxy_pass http://127.0.0.1:8092; }   # fotos enviadas no painel
}
```

Depois: `certbot --nginx -d admin.mcflats.com.br -d mcflats.com.br` para o HTTPS.

---

## Backup

Todo o estado do painel são **arquivos** em `server/data/` (o banco `mcflats.sqlite` e a pasta
`uploads/` com as fotos). Backup = copiar essa pasta. Ex. no rclone da casa:

```bash
rclone copy server/data remote:backups/mcflats-painel/$(date +%F)
```

Migrar para a VPS dedicada do cliente no futuro = copiar `server/data/` + subir o código lá.

---

## Segurança

- Senhas com **bcrypt**; sessão em **JWT** dentro de cookie **httpOnly**.
- Permissões checadas **no servidor** em toda rota (o front só esconde botões).
- `server/.env` e `server/data/` estão no `.gitignore` — **nunca** versione credenciais/banco.
- Uploads limitados a imagens, 12 MB por arquivo.
