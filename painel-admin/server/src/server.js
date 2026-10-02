import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { createWriteStream, createReadStream, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join, resolve as resolvePath, sep } from 'node:path';
import { db, uid, logAudit, seedIfEmpty, transaction, UPLOADS_DIR, DEFAULT_SETTINGS } from './db.js';
import {
  hashPassword, verifyPassword, ROLES, ROLE_LABELS,
  cap, canOnProperty, permsFor,
} from './auth.js';
import { isAvailable } from './availability.js';
import { buildIcs, syncAllFeeds, addDays } from './ical.js';
import { computeReport } from './reports.js';
import { listTurnovers, upsertCleaning } from './cleaning.js';
import { staysConfigured, fetchAllListings, fetchListingDetail, fetchListingPrice, mapListing, fetchListingBlocks, findOrCreateClient, createStaysReservation, cancelStaysReservation, fetchStaysQuote } from './stays.js';
import { isValidCpf, minCheckinIso, isSafeExternalUrl } from './validate.js';
import { encryptCpf, decryptCpf, cpfEncryptionEnabled, encryptSecret, decryptSecret } from './crypto-cpf.js';

const PORT = Number(process.env.PORT || 8092);
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_SECURE = String(process.env.COOKIE_SECURE) === 'true';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''; // login com Google (vazio = desativado)

// Fail-fast: nunca subir com segredo ausente/fraco (permitiria forjar JWT de super admin).
const WEAK_SECRETS = ['dev-secret-change-me', 'troque-este-segredo-por-um-valor-aleatorio-e-longo'];
if (!JWT_SECRET || JWT_SECRET.length < 24 || WEAK_SECRETS.includes(JWT_SECRET)) {
  console.error('FATAL: defina um JWT_SECRET forte no .env (>= 24 caracteres aleatórios).');
  console.error('Gere um: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

// Origens permitidas (CORS). Sem config → cai no modo reflexivo (só dev).
const CORS_ORIGINS = [process.env.ADMIN_ORIGIN, process.env.PUBLIC_ORIGIN].filter((o) => o && o !== '*');

// Guarda-corpos de produção: falha/avisa cedo se o deploy vier com config insegura.
const IS_PROD = process.env.NODE_ENV === 'production';
if (!process.env.SEED_ADMIN_PASSWORD) {
  const msg = 'SEED_ADMIN_PASSWORD ausente — o admin nasceria com senha padrão insegura.';
  if (IS_PROD) { console.error('FATAL: ' + msg + ' Defina no .env.'); process.exit(1); }
  console.warn('AVISO: ' + msg);
}
if (IS_PROD && CORS_ORIGINS.length === 0) console.warn('AVISO: CORS em modo reflexivo em produção — defina ADMIN_ORIGIN/PUBLIC_ORIGIN.');
if (IS_PROD && String(process.env.COOKIE_SECURE) !== 'true') console.warn('AVISO: COOKIE_SECURE!=true em produção — cookies JWT sem flag Secure.');
if (IS_PROD && !cpfEncryptionEnabled()) console.warn('AVISO: CPF_ENC_KEY ausente/inválida — CPFs serão gravados em TEXTO CLARO. Defina uma chave de 32 bytes (hex) no .env.');

// Imagens aceitas em upload — extensão vem do mimetype, nunca do nome do arquivo (evita SVG/XSS e path traversal).
const OK_IMG = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
// Só estas chaves de settings são expostas publicamente (as do conteúdo do site). Blinda vazamento futuro.
const PUBLIC_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
// Documentos (RG/CNH) do titular — dado sensível (LGPD): pasta PRIVADA, nunca servida em /uploads.
const DOCS_DIR = join(UPLOADS_DIR, '..', 'docs');
try { mkdirSync(DOCS_DIR, { recursive: true }); } catch { /* já existe */ }

seedIfEmpty({
  adminName: process.env.SEED_ADMIN_NAME || 'Administrador',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@mcflats.com.br',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || 'mcflats2026',
});

const app = Fastify({ logger: { level: 'info', transport: undefined } });

await app.register(cors, { origin: CORS_ORIGINS.length ? CORS_ORIGINS : true, credentials: true });
await app.register(cookie);
await app.register(jwt, {
  secret: JWT_SECRET,
  cookie: { cookieName: 'token', signed: false },
});
await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 20 } });
await app.register(fstatic, { root: UPLOADS_DIR, prefix: '/uploads/' });

// -------------------------------------------------------------- auth guards
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Não autenticado' });
  }
  const u = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(req.user.id);
  if (!u || !u.active) return reply.code(401).send({ error: 'Sessão inválida' });
  req.currentUser = u;
});

// requireCap = capacidade PLENA (true). Escopo 'own' (corretor) NÃO passa aqui —
// rotas com escopo próprio usam canOnProperty() no lugar.
const requireCap = (capability) => async (req, reply) => {
  if (cap(req.currentUser.role, capability) !== true) {
    return reply.code(403).send({ error: 'Sem permissão para esta ação' });
  }
};

// Rate limit simples em memória para rotas de login/cadastro (anti força-bruta).
const loginHits = new Map(); // ip -> { count, resetAt }
const rateLimitLogin = async (req, reply) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let e = loginHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + 15 * 60 * 1000 }; loginHits.set(ip, e); }
  e.count += 1;
  if (loginHits.size > 5000) { for (const [k, v] of loginHits) if (now > v.resetAt) loginHits.delete(k); }
  if (e.count > 10) return reply.code(429).send({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
};

// Autenticação de HÓSPEDE (cookie separado 'gtoken', não se mistura com o painel).
app.decorate('guestAuth', async (req, reply) => {
  try {
    const t = req.cookies?.gtoken;
    if (!t) throw new Error();
    const p = app.jwt.verify(t);
    if (p.kind !== 'guest') throw new Error();
    const g = db.prepare('SELECT id, name, email, phone FROM guests WHERE id = ?').get(p.gid);
    if (!g) throw new Error();
    req.guest = g;
  } catch {
    return reply.code(401).send({ error: 'Não autenticado' });
  }
});

async function setGuestCookie(reply, gid, name) {
  const token = await reply.jwtSign({ gid, kind: 'guest', name }, { expiresIn: '30d' });
  reply.setCookie('gtoken', token, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/', maxAge: 30 * 24 * 3600 });
}
const guestObj = (g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone });

// -------------------------------------------------------------- serializers
const photoUrl = (p) => (p.filename ? `/uploads/${p.filename}` : p.url || '');

function serializeProperty(row) {
  const photos = db
    .prepare('SELECT id, filename, url, position FROM property_photos WHERE property_id = ? ORDER BY position, created_at')
    .all(row.id)
    .map((p) => ({ id: p.id, url: photoUrl(p), position: p.position }));
  const assignee = row.assigned_to
    ? db.prepare('SELECT name FROM users WHERE id = ?').get(row.assigned_to)
    : null;
  return {
    id: row.id, name: row.name, hood: row.hood,
    bedrooms: row.bedrooms, bathrooms: row.bathrooms, guests: row.guests,
    price: row.price, rating: row.rating, reviews: row.reviews, tag: row.tag,
    description: row.description,
    amenities: safeJson(row.amenities, []),
    address: row.address, status: row.status,
    assigned_to: row.assigned_to, assigned_name: assignee?.name || null,
    featured: !!row.featured, min_nights: row.min_nights || 1,
    lat: row.lat ?? null, lng: row.lng ?? null,
    position: row.position, updated_at: row.updated_at, photos,
  };
}
const safeJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
// Lê uma configuração numérica (>=0) das settings, com fallback.
const settingNum = (key, def) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); const n = Number(r?.value); return Number.isFinite(n) && n >= 0 ? n : def; };
const getProperty = (id) => db.prepare('SELECT * FROM properties WHERE id = ?').get(id);

// ============================================================== AUTH
app.post('/api/auth/login', { preHandler: [rateLimitLogin] }, async (req, reply) => {
  const { email, password } = req.body || {};
  if (!email || !password) return reply.code(400).send({ error: 'Informe e-mail e senha' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
    return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
  }
  const token = await reply.jwtSign({ id: u.id, role: u.role, name: u.name }, { expiresIn: '7d' });
  reply.setCookie('token', token, {
    httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/', maxAge: 7 * 24 * 3600,
  });
  logAudit({ user: u, action: 'login', entity: 'auth' });
  return { user: publicUser(u), perms: permsFor(u.role) };
});

app.post('/api/auth/logout', async (req, reply) => {
  reply.clearCookie('token', { path: '/' });
  return { ok: true };
});

app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req) => {
  return { user: publicUser(req.currentUser), perms: permsFor(req.currentUser.role) };
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ROLE_LABELS[u.role] });

// ============================================================== USERS (super_admin)
app.get('/api/users', { preHandler: [app.authenticate, requireCap('users.manage')] }, async () => {
  return db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at').all()
    .map((u) => ({ ...u, active: !!u.active, roleLabel: ROLE_LABELS[u.role] }));
});

app.post('/api/users', { preHandler: [app.authenticate, requireCap('users.manage')] }, async (req, reply) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return reply.code(400).send({ error: 'Nome, e-mail e senha são obrigatórios' });
  if (!ROLES.includes(role)) return reply.code(400).send({ error: 'Papel inválido' });
  if (String(password).length < 6) return reply.code(400).send({ error: 'A senha deve ter ao menos 6 caracteres' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return reply.code(409).send({ error: 'Já existe um usuário com este e-mail' });
  const id = uid();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, active, created_by)
              VALUES (?, ?, ?, ?, ?, 1, ?)`)
    .run(id, name, String(email).toLowerCase(), hashPassword(password), role, req.currentUser.id);
  logAudit({ user: req.currentUser, action: 'create', entity: 'user', entityId: id, detail: `${name} (${role})` });
  const u = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(id);
  return reply.code(201).send({ ...u, active: !!u.active, roleLabel: ROLE_LABELS[u.role] });
});

app.patch('/api/users/:id', { preHandler: [app.authenticate, requireCap('users.manage')] }, async (req, reply) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return reply.code(404).send({ error: 'Usuário não encontrado' });
  const { name, role, active, password } = req.body || {};
  if (role && !ROLES.includes(role)) return reply.code(400).send({ error: 'Papel inválido' });
  // Não permitir rebaixar/desativar o último super admin
  if (target.role === 'super_admin' && (role && role !== 'super_admin' || active === false)) {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1").get().n;
    if (admins <= 1) return reply.code(400).send({ error: 'É necessário ao menos um Super Admin ativo' });
  }
  db.prepare(`UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      active = COALESCE(?, active),
      password_hash = COALESCE(?, password_hash)
     WHERE id = ?`)
    .run(
      name ?? null,
      role ?? null,
      active === undefined ? null : (active ? 1 : 0),
      password ? hashPassword(password) : null,
      target.id,
    );
  logAudit({ user: req.currentUser, action: 'update', entity: 'user', entityId: target.id, detail: name || target.name });
  const u = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(target.id);
  return { ...u, active: !!u.active, roleLabel: ROLE_LABELS[u.role] };
});

app.delete('/api/users/:id', { preHandler: [app.authenticate, requireCap('users.manage')] }, async (req, reply) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return reply.code(404).send({ error: 'Usuário não encontrado' });
  if (target.id === req.currentUser.id) return reply.code(400).send({ error: 'Você não pode excluir a si mesmo' });
  if (target.role === 'super_admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1").get().n;
    if (admins <= 1) return reply.code(400).send({ error: 'É necessário ao menos um Super Admin ativo' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  logAudit({ user: req.currentUser, action: 'delete', entity: 'user', entityId: target.id, detail: target.name });
  return { ok: true };
});

// Lista enxuta de possíveis responsáveis por imóvel (para o seletor de atribuição).
// Disponível a quem pode editar imóveis (gerente não tem acesso à rota /users completa).
app.get('/api/assignees', { preHandler: [app.authenticate] }, async (req) => {
  if (!cap(req.currentUser.role, 'properties.edit')) return [];
  return db.prepare(
    "SELECT id, name, role FROM users WHERE active = 1 AND role IN ('corretor','gerente','super_admin') ORDER BY name",
  ).all().map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.role] }));
});

// ============================================================== PROPERTIES
app.get('/api/properties', { preHandler: [app.authenticate] }, async () => {
  const rows = db.prepare('SELECT * FROM properties ORDER BY position, created_at').all();
  return rows.map(serializeProperty);
});

app.get('/api/properties/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  return serializeProperty(row);
});

app.post('/api/properties', { preHandler: [app.authenticate, requireCap('properties.create')] }, async (req, reply) => {
  const b = req.body || {};
  if (!b.name) return reply.code(400).send({ error: 'O nome do imóvel é obrigatório' });
  const id = uid();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM properties').get().m;
  db.prepare(`INSERT INTO properties
      (id, name, hood, bedrooms, bathrooms, guests, price, rating, reviews, tag, description, amenities, address, status, assigned_to, featured, min_nights, position)
      VALUES (@id,@name,@hood,@bedrooms,@bathrooms,@guests,@price,@rating,@reviews,@tag,@description,@amenities,@address,@status,@assigned_to,@featured,@min_nights,@position)`)
    .run(normalizeProp({ ...b, id, position: maxPos + 1 }));
  logAudit({ user: req.currentUser, action: 'create', entity: 'property', entityId: id, detail: b.name });
  return reply.code(201).send(serializeProperty(getProperty(id)));
});

app.patch('/api/properties/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'properties.edit', row)) {
    return reply.code(403).send({ error: 'Sem permissão para editar este imóvel' });
  }
  const b = req.body || {};
  const merged = normalizeProp({ ...row, ...b, amenities: b.amenities ?? safeJson(row.amenities, []), id: row.id, position: row.position });
  db.prepare(`UPDATE properties SET
      name=@name, hood=@hood, bedrooms=@bedrooms, bathrooms=@bathrooms, guests=@guests,
      price=@price, rating=@rating, reviews=@reviews, tag=@tag, description=@description,
      amenities=@amenities, address=@address, status=@status, assigned_to=@assigned_to,
      featured=@featured, min_nights=@min_nights, position=@position, updated_at=datetime('now')
     WHERE id=@id`).run(merged);
  logAudit({ user: req.currentUser, action: 'update', entity: 'property', entityId: row.id, detail: merged.name });
  return serializeProperty(getProperty(row.id));
});

app.delete('/api/properties/:id', { preHandler: [app.authenticate, requireCap('properties.delete')] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  // apaga arquivos locais das fotos
  const files = db.prepare('SELECT filename FROM property_photos WHERE property_id = ? AND filename IS NOT NULL').all(row.id);
  db.prepare('DELETE FROM properties WHERE id = ?').run(row.id);
  for (const f of files) unlink(join(UPLOADS_DIR, f.filename)).catch(() => {});
  logAudit({ user: req.currentUser, action: 'delete', entity: 'property', entityId: row.id, detail: row.name });
  return { ok: true };
});

function normalizeProp(b) {
  const hood = ['ipanema', 'leblon'].includes(b.hood) ? b.hood : 'ipanema';
  const status = ['published', 'draft'].includes(b.status) ? b.status : 'published';
  const amen = Array.isArray(b.amenities) ? b.amenities : safeJson(b.amenities, []);
  return {
    id: b.id, name: String(b.name).trim(), hood,
    bedrooms: int(b.bedrooms, 1), bathrooms: int(b.bathrooms, 1), guests: int(b.guests, 2),
    price: int(b.price, 0), rating: clampRating(b.rating), reviews: int(b.reviews, 0),
    tag: (b.tag || '').toString().slice(0, 40), description: (b.description || '').toString(),
    amenities: JSON.stringify(amen), address: (b.address || '').toString(),
    status, assigned_to: b.assigned_to || null,
    featured: b.featured ? 1 : 0, min_nights: Math.max(1, int(b.min_nights, 1)), position: int(b.position, 0),
  };
}
const int = (v, fb) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fb);
const clampRating = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 5; };

// reordenar imóveis (arrastar) — gerente/super
app.patch('/api/properties-order', { preHandler: [app.authenticate, requireCap('properties.edit')] }, async (req) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const upd = db.prepare('UPDATE properties SET position = ? WHERE id = ?');
  transaction(() => ids.forEach((id, i) => upd.run(i, id)));
  return { ok: true };
});

// ============================================================== PHOTOS
app.post('/api/properties/:id/photos', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'photos.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });

  let pos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM property_photos WHERE property_id = ?').get(row.id).m;
  const added = [];
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (!OK_IMG[part.mimetype]) { part.file.resume(); continue; }
      const filename = `${uid()}${OK_IMG[part.mimetype]}`;
      await pipeline(part.file, createWriteStream(join(UPLOADS_DIR, filename)));
      pos += 1;
      const pid = uid();
      db.prepare('INSERT INTO property_photos (id, property_id, filename, position) VALUES (?, ?, ?, ?)').run(pid, row.id, filename, pos);
      added.push({ id: pid, url: `/uploads/${filename}`, position: pos });
    }
  }
  logAudit({ user: req.currentUser, action: 'update', entity: 'property', entityId: row.id, detail: `+${added.length} foto(s)` });
  return reply.code(201).send(added);
});

// adicionar foto por URL (útil para importar)
app.post('/api/properties/:id/photos/url', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'photos.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  const url = (req.body?.url || '').toString().trim();
  if (!isSafeExternalUrl(url)) return reply.code(400).send({ error: 'URL inválida ou não permitida' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM property_photos WHERE property_id = ?').get(row.id).m + 1;
  const pid = uid();
  db.prepare('INSERT INTO property_photos (id, property_id, url, position) VALUES (?, ?, ?, ?)').run(pid, row.id, url, pos);
  return reply.code(201).send({ id: pid, url, position: pos });
});

app.patch('/api/properties/:id/photos/order', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'photos.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const upd = db.prepare('UPDATE property_photos SET position = ? WHERE id = ? AND property_id = ?');
  transaction(() => ids.forEach((pid, i) => upd.run(i, pid, row.id)));
  return { ok: true };
});

app.delete('/api/photos/:photoId', { preHandler: [app.authenticate] }, async (req, reply) => {
  const photo = db.prepare('SELECT * FROM property_photos WHERE id = ?').get(req.params.photoId);
  if (!photo) return reply.code(404).send({ error: 'Foto não encontrada' });
  const row = getProperty(photo.property_id);
  if (!canOnProperty(req.currentUser, 'photos.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  db.prepare('DELETE FROM property_photos WHERE id = ?').run(photo.id);
  if (photo.filename) unlink(join(UPLOADS_DIR, photo.filename)).catch(() => {});
  return { ok: true };
});

// ============================================================== BLOCKS (bloqueio de datas)
app.get('/api/blocks', { preHandler: [app.authenticate] }, async () => {
  return db.prepare(`SELECT b.*, p.name AS property_name FROM blocks b
                     JOIN properties p ON p.id = b.property_id ORDER BY b.start_date DESC`).all();
});

app.get('/api/properties/:id/blocks', { preHandler: [app.authenticate] }, async (req) => {
  return db.prepare('SELECT * FROM blocks WHERE property_id = ? ORDER BY start_date').all(req.params.id);
});

app.post('/api/properties/:id/blocks', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'blocks.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  const { start_date, end_date, reason } = req.body || {};
  if (!isDate(start_date) || !isDate(end_date)) return reply.code(400).send({ error: 'Datas inválidas (use AAAA-MM-DD)' });
  if (end_date < start_date) return reply.code(400).send({ error: 'A data final não pode ser antes da inicial' });
  const id = uid();
  db.prepare('INSERT INTO blocks (id, property_id, start_date, end_date, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, row.id, start_date, end_date, (reason || '').toString().slice(0, 120), req.currentUser.id);
  logAudit({ user: req.currentUser, action: 'create', entity: 'block', entityId: id, detail: `${row.name}: ${start_date}→${end_date}` });
  return reply.code(201).send(db.prepare('SELECT * FROM blocks WHERE id = ?').get(id));
});

app.delete('/api/blocks/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
  const blk = db.prepare('SELECT * FROM blocks WHERE id = ?').get(req.params.id);
  if (!blk) return reply.code(404).send({ error: 'Bloqueio não encontrado' });
  const row = getProperty(blk.property_id);
  if (!canOnProperty(req.currentUser, 'blocks.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  db.prepare('DELETE FROM blocks WHERE id = ?').run(blk.id);
  logAudit({ user: req.currentUser, action: 'delete', entity: 'block', entityId: blk.id });
  return { ok: true };
});
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ============================================================== iCAL (sync com Airbnb/Booking)
// Feed exportável do imóvel (bloqueios manuais + reservas confirmadas). URL não-óbvia (id do imóvel).
app.get('/api/ical/:file', async (req, reply) => {
  const pid = String(req.params.file).replace(/\.ics$/i, '');
  const prop = getProperty(pid);
  if (!prop) return reply.code(404).send('Nao encontrado');
  const blocks = db.prepare("SELECT id, start_date, end_date, reason FROM blocks WHERE property_id = ? AND source = 'manual'").all(pid);
  const resv = db.prepare("SELECT id, checkin, checkout FROM reservations WHERE property_id = ? AND status = 'confirmada'").all(pid);
  const events = [
    ...blocks.map((b) => ({ uid: b.id, start: b.start_date, end: b.end_date, summary: b.reason || 'Bloqueado - MC Flats' })),
    ...resv.map((r) => ({ uid: r.id, start: r.checkin, end: addDays(r.checkout, -1), summary: 'Reservado - MC Flats' })),
  ];
  reply.header('Content-Type', 'text/calendar; charset=utf-8');
  reply.header('Content-Disposition', `inline; filename="${pid}.ics"`);
  return buildIcs(prop.name, events);
});

// Feeds externos por imóvel (Airbnb/Booking) — quem gerencia bloqueios do imóvel.
app.get('/api/properties/:id/ical', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'blocks.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  return db.prepare('SELECT id, url, label, last_sync, last_status FROM ical_feeds WHERE property_id = ? ORDER BY created_at').all(row.id);
});

app.post('/api/properties/:id/ical', { preHandler: [app.authenticate] }, async (req, reply) => {
  const row = getProperty(req.params.id);
  if (!row) return reply.code(404).send({ error: 'Imóvel não encontrado' });
  if (!canOnProperty(req.currentUser, 'blocks.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  const url = (req.body?.url || '').toString().trim();
  if (!isSafeExternalUrl(url)) return reply.code(400).send({ error: 'URL inválida ou não permitida — cole o link iCal do Airbnb ou Booking' });
  const id = uid();
  db.prepare('INSERT INTO ical_feeds (id, property_id, url, label) VALUES (?, ?, ?, ?)').run(id, row.id, url, (req.body?.label || '').toString().slice(0, 40));
  logAudit({ user: req.currentUser, action: 'create', entity: 'ical', entityId: id, detail: row.name });
  return reply.code(201).send({ id });
});

app.delete('/api/ical/:feedId', { preHandler: [app.authenticate] }, async (req, reply) => {
  const feed = db.prepare('SELECT * FROM ical_feeds WHERE id = ?').get(req.params.feedId);
  if (!feed) return reply.code(404).send({ error: 'Feed não encontrado' });
  const row = getProperty(feed.property_id);
  if (row && !canOnProperty(req.currentUser, 'blocks.manage', row)) return reply.code(403).send({ error: 'Sem permissão' });
  db.prepare('DELETE FROM ical_feeds WHERE id = ?').run(feed.id);
  db.prepare('DELETE FROM blocks WHERE source = ?').run('ical:' + feed.id);
  return { ok: true };
});

// Sincroniza agora todos os feeds (também roda automático de hora em hora).
app.post('/api/ical/sync', { preHandler: [app.authenticate, requireCap('blocks.manage')] }, async () => {
  const imported = await syncAllFeeds(db);
  return { ok: true, imported };
});

// isAvailable(db, ...) vem de ./availability.js (testável isoladamente).

// ============================================================== SETTINGS
app.get('/api/settings', { preHandler: [app.authenticate] }, async () => {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
});

app.put('/api/settings', { preHandler: [app.authenticate, requireCap('settings.edit')] }, async (req) => {
  const body = req.body || {};
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(() => { for (const [k, v] of Object.entries(body)) up.run(k, String(v ?? '')); });
  logAudit({ user: req.currentUser, action: 'update', entity: 'settings', detail: Object.keys(body).join(', ') });
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
});

// Upload de imagem do site (banner, cards) — grava em /uploads e devolve a URL.
app.post('/api/settings/image', { preHandler: [app.authenticate, requireCap('settings.edit')] }, async (req, reply) => {
  let saved = null;
  for await (const part of req.parts()) {
    if (part.type !== 'file') continue;
    if (!saved && OK_IMG[part.mimetype]) {
      const filename = `${uid()}${OK_IMG[part.mimetype]}`;
      await pipeline(part.file, createWriteStream(join(UPLOADS_DIR, filename)));
      saved = `/uploads/${filename}`;
    } else {
      part.file.resume(); // drena (tipo inválido ou arquivo extra) — corpo consumido por inteiro
    }
  }
  if (!saved) return reply.code(400).send({ error: 'Envie uma imagem JPG, PNG, WEBP ou GIF' });
  return reply.code(201).send({ url: saved });
});

// ============================================================== AUDIT + STATS
app.get('/api/audit', { preHandler: [app.authenticate, requireCap('audit.view')] }, async (req) => {
  const limit = Math.min(200, int(req.query?.limit, 60));
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit);
});

app.get('/api/stats', { preHandler: [app.authenticate] }, async () => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  return {
    properties: one('SELECT COUNT(*) AS n FROM properties').n,
    published: one("SELECT COUNT(*) AS n FROM properties WHERE status = 'published'").n,
    draft: one("SELECT COUNT(*) AS n FROM properties WHERE status = 'draft'").n,
    users: one('SELECT COUNT(*) AS n FROM users WHERE active = 1').n,
    blocksUpcoming: one("SELECT COUNT(*) AS n FROM blocks WHERE end_date >= date('now')").n,
    reservationsPending: one("SELECT COUNT(*) AS n FROM reservations WHERE status = 'solicitada'").n,
    guests: one('SELECT COUNT(*) AS n FROM guests').n,
    avgPrice: Math.round(one("SELECT COALESCE(AVG(price),0) AS a FROM properties WHERE status='published'").a),
    byHood: {
      ipanema: one("SELECT COUNT(*) AS n FROM properties WHERE hood='ipanema'").n,
      leblon: one("SELECT COUNT(*) AS n FROM properties WHERE hood='leblon'").n,
    },
  };
});

// Relatórios de ocupação / ADR / RevPAR num período [from, to] (inclusivos).
app.get('/api/reports', { preHandler: [app.authenticate] }, async (req, reply) => {
  const from = req.query?.from;
  const to = req.query?.to;
  if (!isDate(from) || !isDate(to) || to < from) return reply.code(400).send({ error: 'Período inválido' });
  const properties = db.prepare("SELECT id, name, hood, price FROM properties WHERE status = 'published'").all();
  // Reservas confirmadas que tocam a janela (checkout exclusivo, então checkout > from).
  const confirmed = db.prepare(
    "SELECT property_id, checkin, checkout, price FROM reservations WHERE status = 'confirmada' AND checkout > ? AND checkin <= ?",
  ).all(from, to);
  // Funil: pedidos criados dentro do período.
  const funnel = db.prepare(
    "SELECT status FROM reservations WHERE date(created_at) BETWEEN ? AND ?",
  ).all(from, to);
  return computeReport({ properties, confirmed, from, to, funnel });
});

// ============================================================== GUEST (área do hóspede)
app.post('/api/guest/register', { preHandler: [rateLimitLogin] }, async (req, reply) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return reply.code(400).send({ error: 'Nome, e-mail e senha são obrigatórios' });
  if (String(password).length < 6) return reply.code(400).send({ error: 'A senha deve ter ao menos 6 caracteres' });
  const em = String(email).toLowerCase();
  if (db.prepare('SELECT id FROM guests WHERE email = ?').get(em)) return reply.code(409).send({ error: 'Já existe uma conta com este e-mail' });
  const id = uid();
  db.prepare('INSERT INTO guests (id, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, em, hashPassword(password), (phone || '').toString());
  await setGuestCookie(reply, id, name);
  return reply.code(201).send({ guest: guestObj({ id, name, email: em, phone: phone || '' }) });
});

app.post('/api/guest/login', { preHandler: [rateLimitLogin] }, async (req, reply) => {
  const { email, password } = req.body || {};
  const g = db.prepare('SELECT * FROM guests WHERE email = ?').get(String(email || '').toLowerCase());
  if (!g || !verifyPassword(password || '', g.password_hash)) return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
  await setGuestCookie(reply, g.id, g.name);
  return { guest: guestObj(g) };
});

// Login/cadastro com Google. Recebe o id_token (credential) do Google Identity Services,
// valida no endpoint tokeninfo do Google e cria/loga o hóspede pelo e-mail verificado.
app.post('/api/guest/google', { preHandler: [rateLimitLogin] }, async (req, reply) => {
  if (!GOOGLE_CLIENT_ID) return reply.code(400).send({ error: 'Login com Google não está configurado' });
  const { credential, accessToken } = req.body || {};
  const j = async (url, opts) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts }); return r.ok ? await r.json() : null; } catch { return null; } };
  let email, name, verified;
  if (credential) {
    // id_token (One Tap / botão GIS): tokeninfo devolve aud + perfil.
    const info = await j(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const issOk = info && ['accounts.google.com', 'https://accounts.google.com'].includes(info.iss);
    if (!info || info.aud !== GOOGLE_CLIENT_ID || !issOk) return reply.code(401).send({ error: 'Login com Google inválido' });
    email = info.email; name = info.name || info.given_name; verified = String(info.email_verified) === 'true';
  } else if (accessToken) {
    // access_token (botão customizado via OAuth): valida a audiência e pega o perfil.
    const t = await j(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!t || t.aud !== GOOGLE_CLIENT_ID) return reply.code(401).send({ error: 'Login com Google inválido' });
    const u = await j('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!u) return reply.code(401).send({ error: 'Não foi possível ler o perfil do Google' });
    email = u.email; name = u.name || u.given_name; verified = String(u.email_verified) === 'true';
  } else {
    return reply.code(400).send({ error: 'Credencial ausente' });
  }
  if (!email || !verified) return reply.code(401).send({ error: 'Login com Google inválido' });
  const em = String(email).toLowerCase();
  name = (name || em.split('@')[0]).toString();
  let g = db.prepare('SELECT * FROM guests WHERE email = ?').get(em);
  if (!g) {
    const id = uid();
    // Conta criada via Google: senha aleatória inutilizável (recupera via "esqueci a senha").
    db.prepare('INSERT INTO guests (id, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, em, hashPassword(uid() + uid()), '');
    g = { id, name, email: em, phone: '' };
  }
  await setGuestCookie(reply, g.id, g.name);
  return { guest: guestObj(g) };
});

app.post('/api/guest/logout', async (req, reply) => { reply.clearCookie('gtoken', { path: '/' }); return { ok: true }; });

app.get('/api/guest/me', { preHandler: [app.guestAuth] }, async (req) => ({ guest: guestObj(req.guest) }));

// LGPD — direito de eliminação: apaga a conta e anonimiza as reservas do hóspede.
app.delete('/api/guest/me', { preHandler: [app.guestAuth] }, async (req, reply) => {
  const gid = req.guest.id;
  transaction(() => {
    db.prepare("UPDATE reservations SET guest_id = NULL, name = '(dados removidos)', email = '', phone = '' WHERE guest_id = ?").run(gid);
    db.prepare('DELETE FROM guests WHERE id = ?').run(gid);
  });
  reply.clearCookie('gtoken', { path: '/' });
  return { ok: true };
});

app.get('/api/guest/reservations', { preHandler: [app.guestAuth] }, async (req) => {
  return db.prepare(
    `SELECT r.*, p.name AS property_name, p.hood FROM reservations r
     LEFT JOIN properties p ON p.id = r.property_id
     WHERE r.guest_id = ?
     ORDER BY r.created_at DESC`,
  ).all(req.guest.id);
});

// Código de reserva único (MCxxxx). Checa colisão no banco — chamar DENTRO da transação.
function genReservationCode() {
  for (let i = 0; i < 60; i++) {
    const code = 'MC' + (1000 + Math.floor(Math.random() * 9000));
    if (!db.prepare('SELECT 1 FROM reservations WHERE code = ?').get(code)) return code;
  }
  return 'MC' + String(Date.now()).slice(-6); // fallback improvável (espaço esgotado)
}

// Criar reserva — EXIGE hóspede logado (guestAuth). Grava no nosso sistema e cria a
// PRÉ-RESERVA no Stays do cliente (entra no PMS pro gestor confirmar).
app.post('/api/reservations', { preHandler: [app.guestAuth] }, async (req, reply) => {
  const b = req.body || {};
  const guest = req.guest;
  if (!b.property_id || !isDate(b.checkin) || !isDate(b.checkout)) return reply.code(400).send({ error: 'Dados de reserva inválidos' });
  if (b.checkout <= b.checkin) return reply.code(400).send({ error: 'A data de saída deve ser depois da entrada' });
  const advanceDays = settingNum('min_advance_days', 1);       // antecedência mínima (dias), configurável
  const minCk = minCheckinIso(Date.now(), advanceDays);
  if (b.checkin < minCk) {
    const horas = advanceDays * 24;
    return reply.code(400).send({ error: `As reservas exigem no mínimo ${horas}h de antecedência. Escolha um check-in a partir de ${minCk.split('-').reverse().join('/')}.` });
  }
  const cpf = String(b.cpf || '').replace(/\D/g, '');
  if (!isValidCpf(cpf)) return reply.code(400).send({ error: 'CPF inválido.' });
  const paymentMethod = ['pix', 'cartao'].includes(b.payment_method) ? b.payment_method : null;
  const prop = getProperty(b.property_id);
  if (!prop || prop.status !== 'published') return reply.code(404).send({ error: 'Imóvel indisponível' });
  const nights = Math.max(1, Math.round((new Date(b.checkout).getTime() - new Date(b.checkin).getTime()) / 86400000));
  const minNights = Math.max(prop.min_nights || 1, settingNum('min_nights_global', 2)); // regra global ou do imóvel (a maior)
  if (nights < minNights) return reply.code(400).send({ error: `A estadia mínima é de ${minNights} diárias.` });

  // Anti-duplicação: se o MESMO hóspede já tem um pedido em aberto (solicitada) para o MESMO
  // imóvel e as MESMAS datas, devolve o existente em vez de criar outro (evita duplo clique/reenvio).
  const dup = db.prepare(
    "SELECT id, code, nights, total, stays_code FROM reservations WHERE guest_id = ? AND property_id = ? AND checkin = ? AND checkout = ? AND status = 'solicitada' ORDER BY created_at DESC LIMIT 1",
  ).get(guest.id, b.property_id, b.checkin, b.checkout);
  if (dup) return reply.code(200).send({ id: dup.id, code: dup.code, status: 'solicitada', nights: dup.nights, total: dup.total, staysSynced: !!dup.stays_code, staysCode: dup.stays_code, duplicate: true });

  const guests = int(b.guests, 1);
  // Preço = TOTAL REAL do Stays nas datas exatas (temporada + taxas). Fonte da verdade.
  // Fallback: preço fixo importado × noites (se o Stays não cotar / estiver fora do ar).
  const quote = (prop.stays_id && staysConfigured()) ? await fetchStaysQuote(prop.stays_id, b.checkin, b.checkout, { guests }) : null;
  const total = quote?.total ?? (prop.price * nights);
  const name = (b.name || guest.name || '').toString();
  const email = String(b.email || guest.email || '').toLowerCase();
  const phone = (b.phone || guest.phone || '').toString();
  const id = uid();

  // Disponibilidade + gravação numa transação atômica (evita corrida de overbooking).
  let code;
  try {
    transaction(() => {
      if (!isAvailable(db, prop.id, b.checkin, b.checkout)) throw Object.assign(new Error('indisponivel'), { unavail: true });
      code = genReservationCode();                              // único (checado dentro da transação)
      db.prepare(`INSERT INTO reservations (id, code, property_id, guest_id, checkin, checkout, guests, nights, price, cleaning, total, name, email, phone, cpf, payment_method)
         VALUES (@id,@code,@pid,@gid,@ci,@co,@g,@n,@price,0,@total,@name,@email,@phone,@cpf,@pm)`).run({
        id, code, pid: prop.id, gid: guest.id, ci: b.checkin, co: b.checkout, g: guests,
        n: nights, price: prop.price, total, name, email, phone, cpf: encryptCpf(cpf), pm: paymentMethod,
      });
    });
  } catch (e) {
    if (e && e.unavail) return reply.code(409).send({ error: 'As datas escolhidas não estão disponíveis para este imóvel. Por favor, escolha outro período.' });
    throw e;
  }

  // Cria a pré-reserva no Stays. Se falhar, o pedido continua salvo no nosso painel.
  let staysSynced = false, staysCode = null;
  if (staysConfigured() && prop.stays_id) {
    try {
      const idclient = await findOrCreateClient({ name, email, phone, cpf });
      const sr = await createStaysReservation({
        listingId: prop.stays_id, checkin: b.checkin, checkout: b.checkout, guests, idclient,
        note: `Reserva pelo site MC Flats — ${name} (${email}) — pagamento: ${paymentMethod || 'a combinar'}`,
      });
      db.prepare('UPDATE reservations SET stays_reservation_id = ?, stays_code = ? WHERE id = ?').run(sr.id, sr.code, id);
      staysSynced = true; staysCode = sr.code;
    } catch (e) {
      app.log.error({ err: String(e?.message || e) }, 'falha ao criar reserva no Stays');
    }
  }
  return reply.code(201).send({ id, code, status: 'solicitada', nights, total, staysSynced, staysCode });
});

// Upload do documento (RG/CNH) do titular — antifraude. Anexa à reserva do PRÓPRIO hóspede.
// Guardado em pasta privada (DOCS_DIR); só o painel (admin) consegue ver.
app.post('/api/reservations/:id/document', { preHandler: [app.guestAuth] }, async (req, reply) => {
  const r = db.prepare('SELECT id, guest_id, doc_file FROM reservations WHERE id = ?').get(req.params.id);
  if (!r || r.guest_id !== req.guest.id) return reply.code(404).send({ error: 'Reserva não encontrada' });
  let saved = null;
  for await (const part of req.parts()) {
    if (part.file) {
      if (!OK_IMG[part.mimetype]) { part.file.resume(); return reply.code(400).send({ error: 'Envie uma foto do documento (JPG, PNG ou WEBP).' }); }
      const filename = `${uid()}${OK_IMG[part.mimetype]}`;
      await pipeline(part.file, createWriteStream(join(DOCS_DIR, filename)));
      saved = filename;
    }
  }
  if (!saved) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });
  if (r.doc_file) unlink(join(DOCS_DIR, r.doc_file)).catch(() => {});
  db.prepare('UPDATE reservations SET doc_file = ? WHERE id = ?').run(saved, r.id);
  return { ok: true };
});

// Dados do cartão do titular (fluxo cartão) — o hóspede envia; ficam CIFRADOS em repouso.
// A equipe (gerente/super) lê no painel pra processar no Stays; some ao confirmar/cancelar.
app.post('/api/reservations/:id/card', { preHandler: [app.guestAuth] }, async (req, reply) => {
  const r = db.prepare('SELECT id, guest_id FROM reservations WHERE id = ?').get(req.params.id);
  if (!r || r.guest_id !== req.guest.id) return reply.code(404).send({ error: 'Reserva não encontrada' });
  const b = req.body || {};
  const numero = String(b.numero || '').replace(/\D/g, '');
  const cvv = String(b.cvv || '').replace(/\D/g, '');
  const titular = String(b.titular || '').trim().slice(0, 80);
  const validade = String(b.validade || '').trim().slice(0, 7);   // MM/AA
  const bandeira = String(b.bandeira || b.tipo || '').trim().slice(0, 20);
  if (numero.length < 13 || numero.length > 19) return reply.code(400).send({ error: 'Número do cartão inválido.' });
  if (cvv.length < 3 || cvv.length > 4) return reply.code(400).send({ error: 'CVV inválido.' });
  if (!titular) return reply.code(400).send({ error: 'Informe o titular do cartão.' });
  if (!/^\d{2}\/?\d{2,4}$/.test(validade)) return reply.code(400).send({ error: 'Validade inválida (MM/AA).' });
  const enc = encryptSecret(JSON.stringify({ titular, numero, validade, cvv, bandeira, at: req.params.id }));
  db.prepare('UPDATE reservations SET card_enc = ? WHERE id = ?').run(enc, r.id);
  return { ok: true };
});

// Ver os dados do cartão de uma reserva — SÓ gerente/super (audit.view). Nunca público. Sem cache.
app.get('/api/admin/reservations/:id/card', { preHandler: [app.authenticate, requireCap('audit.view')] }, async (req, reply) => {
  const r = db.prepare('SELECT card_enc FROM reservations WHERE id = ?').get(req.params.id);
  if (!r || !r.card_enc) return reply.code(404).send({ error: 'Sem dados de cartão' });
  reply.header('Cache-Control', 'private, no-store');
  const data = decryptSecret(r.card_enc);
  let card; try { card = JSON.parse(data); } catch { card = null; }
  if (!card) return reply.code(500).send({ error: 'Não foi possível ler os dados' });
  return { titular: card.titular, numero: card.numero, validade: card.validade, cvv: card.cvv, bandeira: card.bandeira };
});

// Ver o documento de uma reserva — só painel (equipe). Nunca público.
app.get('/api/admin/reservations/:id/document', { preHandler: [app.authenticate, requireCap('blocks.manage')] }, async (req, reply) => {
  const r = db.prepare('SELECT doc_file FROM reservations WHERE id = ?').get(req.params.id);
  if (!r || !r.doc_file) return reply.code(404).send({ error: 'Sem documento' });
  // Confinamento de path: o arquivo servido TEM que estar dentro de DOCS_DIR (defesa contra traversal).
  const safePath = resolvePath(join(DOCS_DIR, r.doc_file));
  if (!safePath.startsWith(resolvePath(DOCS_DIR) + sep)) return reply.code(400).send({ error: 'Arquivo inválido' });
  const ext = String(r.doc_file).split('.').pop();
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream';
  reply.header('Content-Type', mime);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Cache-Control', 'private, no-store');
  return reply.send(createReadStream(safePath));
});

// ============================================================== RESERVAS (admin)
app.get('/api/admin/reservations', { preHandler: [app.authenticate] }, async (req) => {
  // Corretor só vê reservas dos imóveis atribuídos a ele — e SEM PII sensível (CPF/documento).
  // Recepção/gerente/super veem tudo (precisam do CPF/doc pro antifraude no check-in).
  const restricted = req.currentUser.role === 'corretor';
  if (restricted) {
    const rows = db.prepare(
      `SELECT r.*, p.name AS property_name FROM reservations r
       JOIN properties p ON p.id = r.property_id
       WHERE p.assigned_to = ? ORDER BY r.created_at DESC`,
    ).all(req.currentUser.id);
    return rows.map((r) => ({ ...r, cpf: undefined, doc_file: undefined, card_enc: undefined }));
  }
  const rows = db.prepare(
    `SELECT r.*, p.name AS property_name FROM reservations r
     LEFT JOIN properties p ON p.id = r.property_id ORDER BY r.created_at DESC`,
  ).all();
  // CPF é guardado cifrado (LGPD) — decifra só na exibição. O blob do cartão NUNCA vai na lista;
  // só um flag has_card (o dado em si sai pela rota dedicada, gated a gerente/super).
  return rows.map((r) => {
    const { card_enc, ...rest } = r;
    return { ...rest, cpf: r.cpf ? decryptCpf(r.cpf) : r.cpf, has_card: !!card_enc };
  });
});

app.patch('/api/admin/reservations/:id', { preHandler: [app.authenticate, requireCap('blocks.manage')] }, async (req, reply) => {
  const { status } = req.body || {};
  if (!['solicitada', 'confirmada', 'cancelada'].includes(status)) return reply.code(400).send({ error: 'Status inválido' });
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!r) return reply.code(404).send({ error: 'Reserva não encontrada' });
  // Confirmação: checagem de conflito + update na mesma transação (anti-overbooking).
  try {
    transaction(() => {
      if (status === 'confirmada' && r.property_id && !isAvailable(db, r.property_id, r.checkin, r.checkout, r.id)) {
        throw Object.assign(new Error('conflito'), { conflict: true });
      }
      db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, r.id);
    });
  } catch (e) {
    if (e && e.conflict) return reply.code(409).send({ error: 'Não é possível confirmar: as datas conflitam com um bloqueio ou outra reserva já confirmada deste imóvel.' });
    throw e;
  }
  // Auto-expurgo do cartão: ao confirmar ou cancelar, apaga os dados sensíveis (não retém à toa).
  if (status === 'confirmada' || status === 'cancelada') {
    db.prepare('UPDATE reservations SET card_enc = NULL WHERE id = ?').run(r.id);
  }
  logAudit({ user: req.currentUser, action: 'update', entity: 'reservation', entityId: r.id, detail: `${r.code}: ${status}` });
  // Cancelou no painel → propaga o cancelamento pro Stays (best-effort; não bloqueia o cancelamento local).
  let staysCanceled = null;
  if (status === 'cancelada' && r.stays_reservation_id && staysConfigured()) {
    try {
      await cancelStaysReservation(r.stays_reservation_id, `Reserva ${r.code} cancelada pela equipe MC Flats`);
      staysCanceled = true;
    } catch (e) {
      staysCanceled = false;
      req.log.warn({ err: e?.message, reservation: r.code }, 'falha ao cancelar reserva no Stays');
    }
  }
  return { ok: true, staysCanceled };
});

// ============================================================== LIMPEZA (turnovers)
// As tarefas de limpeza são DERIVADAS do checkout de cada reserva confirmada
// (fonte única da verdade). cleaning_status guarda só o estado editável por reserva.
app.get('/api/cleanings', { preHandler: [app.authenticate] }, async (req, reply) => {
  const from = req.query?.from;
  const to = req.query?.to;
  if (!isDate(from) || !isDate(to) || to < from) return reply.code(400).send({ error: 'Período inválido' });
  return listTurnovers(db, from, to);
});

app.patch('/api/cleanings/:reservationId', { preHandler: [app.authenticate, requireCap('blocks.manage')] }, async (req, reply) => {
  const resv = db.prepare("SELECT id, code FROM reservations WHERE id = ? AND status = 'confirmada'").get(req.params.reservationId);
  if (!resv) return reply.code(404).send({ error: 'Turnover não encontrado' });
  const b = req.body || {};
  const status = upsertCleaning(db, resv.id, { status: b.status, assignee: b.assignee, notes: b.notes });
  logAudit({ user: req.currentUser, action: 'update', entity: 'cleaning', entityId: resv.id, detail: `${resv.code}: ${status}` });
  return { ok: true };
});

// ============================================================== STAYS (integração PMS)
// Só super admin. Import cria imóveis como RASCUNHO (não vão ao ar sem revisão).
const requireSuperAdmin = async (req, reply) => {
  if (req.currentUser?.role !== 'super_admin') return reply.code(403).send({ error: 'Apenas o super admin pode gerenciar integrações' });
};

function addStaysPhotos(propertyId, urls) {
  let n = 0;
  const base = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM property_photos WHERE property_id = ?').get(propertyId).m;
  const ins = db.prepare('INSERT INTO property_photos (id, property_id, url, position) VALUES (?, ?, ?, ?)');
  for (const url of urls) { if (!url) continue; ins.run(uid(), propertyId, url, base + 1 + n); n++; }
  return n;
}

// Atualiza a galeria vinda do Stays sem tocar em fotos enviadas à mão (arquivos locais):
// remove as fotos de origem Stays (URL /image/) e regrava a galeria atual.
function syncStaysPhotos(propertyId, urls) {
  db.prepare("DELETE FROM property_photos WHERE property_id = ? AND url LIKE '%/image/%' AND filename IS NULL").run(propertyId);
  return addStaysPhotos(propertyId, urls);
}

// Testa a conexão e devolve uma amostra crua (pra conferir o formato real dos dados).
app.get('/api/stays/status', { preHandler: [app.authenticate, requireSuperAdmin] }, async () => {
  if (!staysConfigured()) return { configured: false, connected: false };
  try {
    const sample = await fetchAllListings({ limit: 1, max: 1 });
    return { configured: true, connected: true, sampleCount: sample.length, sample: sample[0] || null };
  } catch (e) {
    return { configured: true, connected: false, error: String(e.message || e) };
  }
});

// Importa/atualiza imóveis do Stays (upsert por stays_id). Novos entram como rascunho.
app.post('/api/stays/import', { preHandler: [app.authenticate, requireSuperAdmin] }, async (req, reply) => {
  if (!staysConfigured()) return reply.code(400).send({ error: 'Stays não configurado no servidor' });
  let listings;
  try { listings = await fetchAllListings(); }
  catch (e) { return reply.code(502).send({ error: String(e.message || e) }); }

  // Busca detalhe (galeria completa) + cotação de diária de cada imóvel ANTES da transação
  // (chamadas assíncronas não podem rodar dentro de transaction(), que é síncrona).
  const prepared = [];
  for (const raw of listings) {
    let full = raw;
    try { full = await fetchListingDetail(raw._id); } catch { /* usa o resumo da lista */ }
    const m = mapListing(full);
    if (!m.staysId) continue;
    m.price = await fetchListingPrice(raw._id, { guests: 2 });
    prepared.push(m);
  }

  let created = 0, updated = 0, photos = 0;
  transaction(() => {
    for (const m of prepared) {
      const status = m.active ? 'published' : 'draft'; // Stays: active→no ar, hidden→rascunho
      const existing = db.prepare('SELECT id, price FROM properties WHERE stays_id = ?').get(m.staysId);
      if (existing) {
        // Atualiza o CONTEÚDO + o status ativo/inativo do Stays; preserva tag/destaque/posição.
        db.prepare(`UPDATE properties SET name=@name, hood=@hood, bedrooms=@bd, bathrooms=@ba,
            guests=@g, description=@desc, address=@addr, status=@status, stays_active=@sa, lat=@lat, lng=@lng, updated_at=datetime('now') WHERE id=@id`)
          .run({ id: existing.id, name: m.name, hood: m.hood, bd: m.bedrooms, ba: m.bathrooms, g: m.guests, desc: m.description, addr: m.address, status, sa: m.active ? 1 : 0, lat: m.lat ?? null, lng: m.lng ?? null });
        // Preço só é preenchido se ainda não houver um (não sobrescreve ajuste manual).
        if ((existing.price || 0) === 0 && m.price > 0) db.prepare('UPDATE properties SET price = ? WHERE id = ?').run(m.price, existing.id);
        updated++;
        photos += syncStaysPhotos(existing.id, m.photos);
      } else {
        const id = uid();
        const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM properties').get().m;
        db.prepare(`INSERT INTO properties (id, name, hood, bedrooms, bathrooms, guests, price, description, address, status, position, stays_id, stays_active, lat, lng)
            VALUES (@id,@name,@hood,@bd,@ba,@g,@price,@desc,@addr,@status,@pos,@sid,@sa,@lat,@lng)`)
          .run({ id, name: m.name, hood: m.hood, bd: m.bedrooms, ba: m.bathrooms, g: m.guests, price: m.price, desc: m.description, addr: m.address, status, pos: maxPos + 1, sid: m.staysId, sa: m.active ? 1 : 0, lat: m.lat ?? null, lng: m.lng ?? null });
        created++;
        photos += addStaysPhotos(id, m.photos);
      }
    }
  });
  const active = prepared.filter((m) => m.active).length;
  logAudit({ user: req.currentUser, action: 'update', entity: 'stays', detail: `import: +${created} novos, ${updated} atualizados, ${active} ativos` });
  return { ok: true, total: listings.length, created, updated, photos, active, inactive: prepared.length - active };
});

// Reaplica o estado: publica os ATIVOS do Stays, rascunha os inativos (hidden) e os demos.
app.post('/api/stays/publish', { preHandler: [app.authenticate, requireSuperAdmin] }, async (req) => {
  const pub = db.prepare("UPDATE properties SET status='published', updated_at=datetime('now') WHERE stays_id IS NOT NULL AND stays_active=1 AND status='draft'").run();
  const off = db.prepare("UPDATE properties SET status='draft', updated_at=datetime('now') WHERE stays_id IS NOT NULL AND stays_active=0 AND status='published'").run();
  const hid = db.prepare("UPDATE properties SET status='draft', updated_at=datetime('now') WHERE stays_id IS NULL AND status='published'").run();
  logAudit({ user: req.currentUser, action: 'update', entity: 'stays', detail: `publicar: ${pub.changes} no ar, ${off.changes} inativos + ${hid.changes} demos ocultados` });
  return { ok: true, published: pub.changes, hidden: off.changes + hid.changes };
});

// Sincroniza a disponibilidade real (reservas do Stays) → bloqueios source='stays:<id>'.
async function runStaysAvailabilitySync() {
  if (!staysConfigured()) return { properties: 0, imported: 0, failed: 0 };
  const props = db.prepare('SELECT id, stays_id FROM properties WHERE stays_id IS NOT NULL').all();
  // janela: reservas com chegada de 180 dias atrás (pega estadias longas/temporada ainda em curso)
  // a 1 ano à frente. Antes eram 31 dias — reservas mensais iniciadas há mais de 1 mês sumiam,
  // liberando datas que na verdade estavam ocupadas (overbooking silencioso).
  const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  let imported = 0, failed = 0;
  for (const p of props) {
    try {
      const ranges = await fetchListingBlocks(p.stays_id, from, to);
      const source = 'stays:' + p.stays_id;
      transaction(() => {
        db.prepare('DELETE FROM blocks WHERE source = ?').run(source);
        const ins = db.prepare('INSERT INTO blocks (id, property_id, start_date, end_date, reason, source) VALUES (?,?,?,?,?,?)');
        for (const r of ranges) ins.run(uid(), p.id, r.start, r.end, 'Ocupado (Stays)', source);
      });
      imported += ranges.length;
    } catch { failed++; }
  }
  return { properties: props.length, imported, failed };
}

app.post('/api/stays/sync-availability', { preHandler: [app.authenticate, requireSuperAdmin] }, async (req, reply) => {
  if (!staysConfigured()) return reply.code(400).send({ error: 'Stays não configurado no servidor' });
  const r = await runStaysAvailabilitySync();
  logAudit({ user: req.currentUser, action: 'update', entity: 'stays', detail: `sync disponibilidade: ${r.imported} períodos, ${r.failed} falhas` });
  return { ok: true, ...r };
});

// ============================================================== PUBLIC (site)
app.get('/api/public/properties', async () => {
  const rows = db.prepare("SELECT * FROM properties WHERE status = 'published' ORDER BY position, created_at").all();
  return rows.map((r) => {
    const p = serializeProperty(r);
    return { ...p, assigned_to: undefined, assigned_name: undefined }; // não expõe atribuição interna
  });
});

// Config pública p/ o site (ativa recursos por env sem rebuild do front).
app.get('/api/public/config', async () => ({ googleClientId: GOOGLE_CLIENT_ID }));

// Busca com datas: SÓ imóveis DISPONÍVEIS no período (blocos + reservas confirmadas do Stays,
// sincronizados) e com capacidade >= hóspedes. Sem "sob consulta" aqui.
app.get('/api/public/search', async (req, reply) => {
  const checkin = req.query?.checkin, checkout = req.query?.checkout;
  const guests = Math.min(30, Math.max(1, Number(req.query?.guests) || 1));
  if (!isDate(checkin) || !isDate(checkout) || checkout <= checkin) return reply.code(400).send({ error: 'Datas inválidas' });
  if (checkin < minCheckinIso(Date.now(), settingNum('min_advance_days', 1))) return reply.code(400).send({ error: 'Antecedência mínima não atendida.' });
  // Só publicados, capacidade >= hóspedes, COM preço (0 = "sob consulta", não entra na busca com datas) e disponíveis.
  const rows = db.prepare("SELECT * FROM properties WHERE status = 'published' AND guests >= ? AND price > 0 ORDER BY position, created_at").all(guests);
  return rows
    .filter((r) => isAvailable(db, r.id, checkin, checkout))
    .map((r) => { const p = serializeProperty(r); return { ...p, assigned_to: undefined, assigned_name: undefined }; });
});

// Preço REAL de uma estadia (total do Stays nas datas exatas) — o site mostra este valor,
// que bate com o Stays (temporada + taxas). Fallback: preço fixo × noites.
app.get('/api/public/price', async (req, reply) => {
  const { property_id, checkin, checkout } = req.query || {};
  const guests = Math.min(30, Math.max(1, Number(req.query?.guests) || 1));
  if (!property_id || !isDate(checkin) || !isDate(checkout) || checkout <= checkin) return reply.code(400).send({ error: 'Parâmetros inválidos' });
  const prop = getProperty(property_id);
  if (!prop || prop.status !== 'published') return reply.code(404).send({ error: 'Imóvel indisponível' });
  const nights = Math.max(1, Math.round((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000));
  const quote = (prop.stays_id && staysConfigured()) ? await fetchStaysQuote(prop.stays_id, checkin, checkout, { guests }) : null;
  const total = quote?.total ?? (prop.price > 0 ? prop.price * nights : 0);
  return { total, nights, fees: quote?.fees ?? 0, source: quote ? 'stays' : 'flat' };
});

app.get('/api/public/settings', async () => {
  // Whitelist explícita: nunca expor uma chave sensível que venha a ser adicionada no futuro.
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.filter((r) => PUBLIC_SETTING_KEYS.has(r.key)).map((r) => [r.key, r.value]));
});

app.get('/api/public/availability/:id', async (req) => {
  const id = req.params.id;
  const blocks = db.prepare(
    "SELECT start_date AS start, end_date AS end FROM blocks WHERE property_id = ? AND end_date >= date('now')",
  ).all(id);
  const resv = db.prepare(
    "SELECT checkin AS start, date(checkout, '-1 day') AS end FROM reservations WHERE property_id = ? AND status = 'confirmada' AND checkout >= date('now')",
  ).all(id);
  return [...blocks, ...resv].sort((a, b) => (a.start < b.start ? -1 : 1));
});

app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

// Lock por-tarefa: evita que dois ciclos do mesmo sync rodem sobrepostos (um lento não
// dispara outro em cima, o que duplicaria bloqueios e travaria o thread síncrono do SQLite).
const runLocked = (() => {
  const running = new Set();
  return async (key, fn) => {
    if (running.has(key)) return;
    running.add(key);
    try { await fn(); } catch { /* já logado no fn */ } finally { running.delete(key); }
  };
})();

// Sincroniza os feeds iCal externos ~30s após subir e depois de hora em hora.
setTimeout(() => runLocked('ical', () => syncAllFeeds(db)), 30000);
setInterval(() => runLocked('ical', () => syncAllFeeds(db)), 60 * 60 * 1000);

// Auto-sync da disponibilidade do Stays: ~60s após subir e a cada 3 horas.
if (staysConfigured()) {
  setTimeout(() => runLocked('stays', runStaysAvailabilitySync), 60000);
  setInterval(() => runLocked('stays', runStaysAvailabilitySync), 3 * 60 * 60 * 1000);
}

// -------------------------------------------------------------- start
// Só loopback: a API nunca fica exposta direto na porta; o nginx faz o proxy.
const HOST = process.env.HOST || '127.0.0.1';
app.listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`MC Flats admin API on ${HOST}:${PORT}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
