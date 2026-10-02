# MC Flats — Sistema de Reservas

Site público de reservas + painel administrativo para locação de apartamentos por temporada
(Ipanema e Leblon). O fluxo de reserva **nunca confirma automaticamente**: o site monta o pedido
e termina no WhatsApp, onde a equipe confirma manualmente. Integra com o PMS **Stays** (preço real
por data, pré-reserva, disponibilidade).

## Estrutura

```
site-app/            Site público (React + Vite + TypeScript). Vitrine + fluxo de reserva.
painel-admin/
  server/            API (Node 24 + Fastify + SQLite embutido do Node). Auth JWT em cookie.
  web/               Painel do admin (React + Vite). Reservas, imóveis, bloqueios, usuários.
```

> Sem Supabase, sem banco externo: o backend usa o SQLite embutido do Node (`node:sqlite`),
> guardado em `painel-admin/server/data/` (não versionado). Apagar essa pasta reseeda limpo.

## Como rodar (desenvolvimento)

Pré-requisitos: **Node 22.5+** (ideal Node 24 — usa `node:sqlite`).

**1. API (backend)**
```bash
cd painel-admin/server
cp .env.example .env     # ajuste as variáveis (ver abaixo)
npm install
npm start                # sobe em http://127.0.0.1:8092
```

**2. Painel admin**
```bash
cd painel-admin/web
npm install
npm run dev              # Vite em http://localhost:5174
```

**3. Site público**
```bash
cd site-app
npm install
npm run dev
```

O primeiro boot da API cria o Super Admin a partir das variáveis `SEED_ADMIN_*` do `.env`.

## Variáveis de ambiente (API)

Todas em `painel-admin/server/.env` (ver `.env.example`). As principais:

| Variável | Para quê |
|---|---|
| `JWT_SECRET` | Segredo do JWT (obrigatório, longo e aleatório) |
| `SEED_ADMIN_*` | Primeiro admin criado no boot inicial |
| `ADMIN_ORIGIN` / `PUBLIC_ORIGIN` | CORS do painel e do site |
| `COOKIE_SECURE` | `true` em produção (HTTPS) |
| `STAYS_BASE_URL` / `STAYS_CLIENT_ID` / `STAYS_CLIENT_SECRET` | Integração com o PMS Stays (preço, disponibilidade, pré-reserva) |
| `CPF_ENC_KEY` | Chave AES-256-GCM (32 bytes hex) p/ cifrar CPF/cartão em repouso. **Nunca trocar depois de gravar dados.** |
| `GOOGLE_CLIENT_ID` | Login com Google (opcional) |

## Testes

```bash
cd painel-admin/server && npm test
```

## Segurança / LGPD (resumo)

- CPF e dados de cartão são **cifrados em repouso** (AES-256-GCM).
- Dados de cartão só são visíveis a gerente/super no painel e **auto-expurgados** ao confirmar/cancelar.
- Documento (RG/CNH) fica em pasta **privada**, nunca servido publicamente.
- Nada de segredo ou banco neste repositório — ver `.gitignore`.

---
Projeto da BKon para a MC Flats. Repositório privado.
