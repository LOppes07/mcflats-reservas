import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');
export const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const DB_PATH = join(DATA_DIR, 'mcflats.sqlite');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// SQLite embutido do Node (>= 22.5). Zero módulo nativo para compilar.
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Migrações para bancos já existentes (ignora se a coluna já houver).
try { db.exec('ALTER TABLE properties ADD COLUMN featured INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE properties ADD COLUMN min_nights INTEGER NOT NULL DEFAULT 1'); } catch { /* já existe */ }
try { db.exec("ALTER TABLE blocks ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"); } catch { /* já existe */ }
try { db.exec('ALTER TABLE properties ADD COLUMN stays_id TEXT'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE properties ADD COLUMN stays_active INTEGER NOT NULL DEFAULT 1'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE reservations ADD COLUMN stays_reservation_id TEXT'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE reservations ADD COLUMN stays_code TEXT'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE properties ADD COLUMN lat REAL'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE properties ADD COLUMN lng REAL'); } catch { /* já existe */ }
try { db.exec('ALTER TABLE reservations ADD COLUMN cpf TEXT'); } catch { /* já existe */ }
try { db.exec("ALTER TABLE reservations ADD COLUMN payment_method TEXT"); } catch { /* já existe */ }
try { db.exec('ALTER TABLE reservations ADD COLUMN doc_file TEXT'); } catch { /* já existe */ }
// Dados do cartão CIFRADOS (JSON via AES-256-GCM). Nunca em texto puro; auto-apagados ao confirmar/cancelar.
try { db.exec('ALTER TABLE reservations ADD COLUMN card_enc TEXT'); } catch { /* já existe */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_stays ON properties(stays_id) WHERE stays_id IS NOT NULL'); } catch { /* ok */ }

/** node:sqlite não tem o helper .transaction() do better-sqlite3 — este cobre. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('super_admin','gerente','corretor','recepcao')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT
);

CREATE TABLE IF NOT EXISTS properties (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  hood        TEXT NOT NULL DEFAULT 'ipanema',
  bedrooms    INTEGER NOT NULL DEFAULT 1,
  bathrooms   INTEGER NOT NULL DEFAULT 1,
  guests      INTEGER NOT NULL DEFAULT 2,
  price       INTEGER NOT NULL DEFAULT 0,
  rating      REAL NOT NULL DEFAULT 5.0,
  reviews     INTEGER NOT NULL DEFAULT 0,
  tag         TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amenities   TEXT NOT NULL DEFAULT '[]',   -- JSON array
  address     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  assigned_to TEXT,                          -- user id (corretor responsável)
  featured    INTEGER NOT NULL DEFAULT 0,    -- destaque na página inicial
  min_nights  INTEGER NOT NULL DEFAULT 1,    -- mínimo de noites por reserva
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS property_photos (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  filename    TEXT,                          -- arquivo local em data/uploads
  url         TEXT,                          -- OU url externa (ex: seed Unsplash)
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  start_date  TEXT NOT NULL,                 -- yyyy-mm-dd
  end_date    TEXT NOT NULL,                 -- yyyy-mm-dd
  reason      TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual',-- 'manual' ou 'ical:<feedId>'
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

-- Feeds iCal externos (Airbnb/Booking) importados por imóvel.
CREATE TABLE IF NOT EXISTS ical_feeds (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  url         TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  last_sync   TEXT,
  last_status TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Contas de hóspede (cliente final) — separadas dos usuários do painel.
CREATE TABLE IF NOT EXISTS guests (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pedidos de reserva gravados pelo site (o hóspede vê os dele; o admin vê todos).
CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  property_id TEXT,
  guest_id    TEXT,
  checkin     TEXT NOT NULL,
  checkout    TEXT NOT NULL,
  guests      INTEGER NOT NULL DEFAULT 1,
  nights      INTEGER NOT NULL DEFAULT 1,
  price       INTEGER NOT NULL DEFAULT 0,   -- diária no momento do pedido
  cleaning    INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','confirmada','cancelada')),
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resv_guest ON reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_resv_email ON reservations(email);
CREATE INDEX IF NOT EXISTS idx_resv_avail ON reservations(property_id, status);

-- Limpeza: as tarefas (turnovers) são DERIVADAS do checkout das reservas confirmadas
-- (fonte única da verdade). Esta tabela guarda apenas o estado editável de cada turnover,
-- com a reserva como chave. Sem linha = pendente, sem responsável.
CREATE TABLE IF NOT EXISTS cleaning_status (
  reservation_id TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida')),
  assignee       TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  user_name  TEXT,
  action     TEXT NOT NULL,                  -- create | update | delete | login | ...
  entity     TEXT NOT NULL,                  -- property | user | block | settings | auth
  entity_id  TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_prop  ON property_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_blocks_prop  ON blocks(property_id);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_log(created_at);
`);

// ---------------------------------------------------------------- helpers
export const uid = () => randomUUID();

export function logAudit({ user, action, entity, entityId = null, detail = '' }) {
  db.prepare(
    `INSERT INTO audit_log (id, user_id, user_name, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(uid(), user?.id ?? null, user?.name ?? 'sistema', action, entity, entityId, detail);
}

// ---------------------------------------------------------------- default settings
export const DEFAULT_SETTINGS = {
  brand_name: 'MC Flats',
  contact_phone: '+55 21 2523-5959',
  contact_whatsapp: '5521981366864',
  contact_email: 'reservas@mcflats.com.br',
  address: 'Zona Sul · Rio de Janeiro',
  instagram_url: '',
  facebook_url: '',
  cleaning_fee: '180',
  // Regras de reserva (editáveis; o Stays tem por imóvel mas não expõe na API — refletir o que está lá).
  min_advance_days: '1',   // antecedência mínima em dias (1 = ~24h)
  min_nights_global: '2',  // diárias mínimas globais (override por imóvel via min_nights do imóvel)
  hero_title: 'Apartamentos premium em Ipanema e Leblon',
  hero_subtitle:
    'Hospedagem, locação por temporada e administração de imóveis com a experiência de quem conhece a Zona Sul do Rio há mais de 30 anos.',
  stat_years: '30+',
  stat_rating: '4.9',
  stat_reviews: '1.240',
  institutional_about:
    'Conhecemos cada quadra de Ipanema e Leblon. Cuidamos da hospedagem dos nossos hóspedes e da rentabilidade dos nossos proprietários com a mesma dedicação.',

  // Títulos de seção editáveis
  dif_eyebrow: 'A experiência MC Flats',
  dif_title: 'Conforto de casa, com serviço de hotel',
  depo_eyebrow: 'Quem se hospeda, volta',
  depo_title: 'Histórias de quem viveu a Zona Sul com a gente',

  // Seção "Invista no Rio"
  invest_eyebrow: 'Compra e venda de apart hotel',
  invest_title: 'Invista em imóveis no Rio de Janeiro',
  invest_subtitle:
    'Ajudamos investidores a comprar e vender unidades de apart hotel em Ipanema e Leblon. São imóveis muito procurados para temporada, com bom potencial de retorno. Cuidamos desde a escolha da unidade até a administração da locação.',
  invest_cta: 'Falar com um consultor',

  // Imagens do site (vazio = usa a imagem embutida no site)
  hero_image: '',
  image_ipanema: '',
  image_leblon: '',

  // Reserva / conversão
  cancel_policy: 'Cancelamento gratuito até 7 dias antes do check-in. Após esse prazo, a primeira diária não é reembolsável.',
  house_checkin: 'a partir das 15h',
  house_checkout: 'até as 11h',
  house_rules: 'Não são permitidas festas ou eventos. Silêncio a partir das 22h. Proibido fumar nas áreas internas do apartamento.',
  weekly_discount: '10',   // % para 7+ noites
  monthly_discount: '20',  // % para 28+ noites
  ota_savings: '15',       // % de economia vs. plataformas (0 = esconde a mensagem)

  // Seção "Proprietários"
  owner_title: 'Tem um imóvel na Zona Sul? Deixe ele render.',
  owner_text:
    'Cuidamos da divulgação, das reservas, da hospedagem e do repasse do seu imóvel, com transparência e o conhecimento de quem atua no bairro há mais de 30 anos. Você recebe e a gente opera.',
  owner_cta: 'Anunciar meu imóvel',

  // Listas (JSON) editáveis pelo painel
  diferenciais_json: JSON.stringify([
    { icon: 'sparkle', title: 'Serviço de arrumação', desc: 'Apartamento sempre limpo e organizado, com o cuidado diário de um hotel.' },
    { icon: 'work', title: 'Espaço para trabalho', desc: 'Estação de trabalho e internet de alta velocidade em todas as unidades.' },
    { icon: 'kitchen', title: 'Cozinha completa', desc: 'Utensílios e eletrodomésticos prontos para você cozinhar à vontade.' },
    { icon: 'car', title: 'Vaga privativa', desc: 'Estacionamento incluso para você chegar de carro sem preocupação.' },
    { icon: 'clock', title: 'Recepção 24 horas', desc: 'Atendimento a qualquer hora, com check-in noturno quando você precisar.' },
    { icon: 'pet', title: 'Pet friendly', desc: 'Unidades selecionadas recebem o seu melhor amigo de quatro patas.' },
  ]),
  depoimentos_json: JSON.stringify([
    { name: 'Marina A.', city: 'São Paulo', text: 'Apartamento impecável, a duas quadras da praia de Ipanema. A recepção 24h fez toda a diferença na nossa chegada de madrugada. Voltaremos com certeza!' },
    { name: 'Carlos R.', city: 'Buenos Aires', text: 'Fiquei um mês a trabalho no Leblon. A estação de trabalho e a internet foram perfeitas, e a arrumação diária deixou tudo leve. Serviço de hotel com conforto de casa.' },
    { name: 'Juliana e Pedro', city: 'Belo Horizonte', text: 'Lua de mel no Beach Star. Vista linda, tudo limpo e a equipe super atenciosa pelo WhatsApp. Recomendo de olhos fechados.' },
  ]),
  faqs_json: JSON.stringify([
    { q: 'Como faço uma reserva?', a: 'Escolha o apartamento, as datas e o número de hóspedes e clique em Reservar. Você finaliza pelo WhatsApp com a nossa equipe, que confirma a disponibilidade na hora, sem enrolação.' },
    { q: 'Qual o horário de check-in e check-out?', a: 'Check-in a partir das 15h e check-out até as 11h. Como temos recepção 24 horas, conseguimos receber chegadas noturnas com aviso prévio.' },
    { q: 'Os apartamentos têm Wi-Fi e espaço para trabalhar?', a: 'Sim. Todas as unidades têm internet rápida e uma estação de trabalho, ótimas para uma viagem de lazer ou para trabalhar de casa por mais tempo.' },
    { q: 'Aceitam animais de estimação?', a: 'Algumas unidades são pet friendly. Fale com a gente pelo WhatsApp antes de reservar que indicamos os apartamentos disponíveis para o seu pet.' },
    { q: 'Vocês administram imóveis de proprietários?', a: 'Sim. Cuidamos da divulgação, das reservas, da hospedagem e do repasse do seu imóvel, com mais de 30 anos de bairro na Zona Sul do Rio.' },
    { q: 'Como funciona a compra e venda de apart hotel?', a: 'Assessoramos investidores na compra e venda de unidades de apart hotel no Rio, com ótimo potencial de rentabilidade por temporada. Fale com a nossa equipe para as oportunidades atuais.' },
  ]),
};

// ---------------------------------------------------------------- seed
// Os 11 imóveis atuais do site (mesmos dados de site-app/src/data.ts), já
// cadastrados para o painel não nascer vazio. Fotos entram como URL (Unsplash)
// e podem ser trocadas por upload real pelo painel.
const SEED_PROPS = [
  { name: 'Monsieur Le Blond 606', hood: 'leblon', bd: 1, ba: 1, g: 3, price: 690, rating: 4.9, reviews: 32, tag: '', imgs: ['1522708323590-d24dbb6b0267', '1505693416388-ac5ce068fe85', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1544989164-31dc3c645987'] },
  { name: 'Leblon Inn 107', hood: 'leblon', bd: 1, ba: 1, g: 3, price: 640, rating: 4.8, reviews: 27, tag: '', imgs: ['1493809842364-78817add7ffb', '1505691938895-1758d7feb511', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1483729558449-99ef09a8c325'] },
  { name: 'Leblon Inn 404', hood: 'leblon', bd: 1, ba: 1, g: 3, price: 720, rating: 5.0, reviews: 18, tag: 'Top avaliado', imgs: ['1545324418-cc1a3fa10c00', '1502005229762-cf1b2da7c5d6', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1560449752-3fd4bdbe7df0'] },
  { name: 'The Claridge 1101', hood: 'leblon', bd: 1, ba: 1, g: 3, price: 880, rating: 4.9, reviews: 41, tag: 'Vista mar', imgs: ['1560185007-cde436f6a4d0', '1540518614846-7eded433c457', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1518639192441-8fce0a366e2e'] },
  { name: 'Beach Star 403', hood: 'ipanema', bd: 1, ba: 1, g: 3, price: 750, rating: 4.9, reviews: 56, tag: 'Mais reservado', imgs: ['1502672260266-1c1ef2d93688', '1502005229762-cf1b2da7c5d6', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1516306580123-e6e52b1b7b5f'] },
  { name: 'Beach Star 201', hood: 'ipanema', bd: 1, ba: 1, g: 2, price: 700, rating: 4.7, reviews: 22, tag: '', imgs: ['1554995207-c18c203602cb', '1505693416388-ac5ce068fe85', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1516306580123-e6e52b1b7b5f'] },
  { name: 'Beach Star 102', hood: 'ipanema', bd: 1, ba: 1, g: 3, price: 760, rating: 5.0, reviews: 39, tag: '', imgs: ['1586105251261-72a756497a11', '1522771739844-6a9f6d5f14af', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1544989164-31dc3c645987'] },
  { name: 'Beach Star 101', hood: 'ipanema', bd: 1, ba: 2, g: 3, price: 820, rating: 4.8, reviews: 30, tag: '', imgs: ['1600585154340-be6161a56a0c', '1540518614846-7eded433c457', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1518639192441-8fce0a366e2e'] },
  { name: 'Vinicius Studio 802', hood: 'ipanema', bd: 0, ba: 1, g: 2, price: 580, rating: 4.8, reviews: 44, tag: 'Studio', imgs: ['1600566753086-00f18fb6b3ea', '1505691938895-1758d7feb511', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1483729558449-99ef09a8c325'] },
  { name: 'Farme 305', hood: 'ipanema', bd: 2, ba: 2, g: 4, price: 980, rating: 4.9, reviews: 61, tag: '2 quartos', imgs: ['1560448204-e02f11c3d0e2', '1522771739844-6a9f6d5f14af', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1560449752-3fd4bdbe7df0'] },
  { name: 'Prudente 1204', hood: 'ipanema', bd: 1, ba: 1, g: 2, price: 690, rating: 4.7, reviews: 25, tag: '', imgs: ['1600210492486-724fe5c67fb0', '1502005229762-cf1b2da7c5d6', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1516306580123-e6e52b1b7b5f'] },
];

const DEFAULT_AMENITIES = [
  'Wi-Fi de alta velocidade', 'Cozinha completa', 'Arrumação diária', 'Recepção 24 horas',
  'Ar-condicionado', 'Vaga privativa', 'Estação de trabalho', 'Smart TV',
];

const DEFAULT_DESC =
  'Apartamento a poucos passos da praia, com sala arejada, cozinha completa e arrumação diária. Tem recepção 24 horas e internet rápida, ótimo tanto para férias quanto para estadias mais longas na Zona Sul do Rio.';

export function seedIfEmpty({ adminName, adminEmail, adminPassword }) {
  const insertSetting = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`,
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, String(v));

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const id = uid();
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'super_admin', 1)`,
    ).run(id, adminName, adminEmail.toLowerCase(), bcrypt.hashSync(adminPassword, 12));
    logAudit({ user: { id, name: adminName }, action: 'seed', entity: 'user', entityId: id, detail: 'Super admin inicial criado' });
    console.log(`[seed] Super admin criado: ${adminEmail}`);
  }

  const propCount = db.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
  if (propCount === 0) {
    const insProp = db.prepare(
      `INSERT INTO properties (id, name, hood, bedrooms, bathrooms, guests, price, rating, reviews, tag, description, amenities, status, position)
       VALUES (@id, @name, @hood, @bd, @ba, @g, @price, @rating, @reviews, @tag, @desc, @amen, 'published', @pos)`,
    );
    const insPhoto = db.prepare(
      `INSERT INTO property_photos (id, property_id, url, position) VALUES (?, ?, ?, ?)`,
    );
    transaction(() => {
      SEED_PROPS.forEach((p, i) => {
        const id = uid();
        insProp.run({
          id, name: p.name, hood: p.hood, bd: p.bd, ba: p.ba, g: p.g, price: p.price,
          rating: p.rating, reviews: p.reviews, tag: p.tag, desc: DEFAULT_DESC,
          amen: JSON.stringify(DEFAULT_AMENITIES), pos: i,
        });
        p.imgs.forEach((imgId, j) => {
          const url = `https://images.unsplash.com/photo-${imgId}?w=1400&q=72&auto=format&fit=crop`;
          insPhoto.run(uid(), id, url, j);
        });
      });
    });
    console.log(`[seed] ${SEED_PROPS.length} imóveis carregados.`);
  }
}
