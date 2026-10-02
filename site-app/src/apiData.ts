import { APTS, AMEN, type Apt } from './data';

// URL base da API. Vazio = mesma origem (em produção o nginx faz proxy de /api e /uploads).
// Em dev, o proxy do vite.config aponta /api e /uploads para a API local.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export type PublicSettings = {
  brand_name: string;
  contact_phone: string;
  contact_whatsapp: string;
  contact_email: string;
  address: string;
  instagram_url: string;
  facebook_url: string;
  cleaning_fee: string;
  hero_title: string;
  hero_subtitle: string;
  stat_years: string;
  stat_rating: string;
  stat_reviews: string;
  institutional_about: string;
  // títulos de seção + textos de marketing (editáveis no painel)
  dif_eyebrow: string;
  dif_title: string;
  depo_eyebrow: string;
  depo_title: string;
  invest_eyebrow: string;
  invest_title: string;
  invest_subtitle: string;
  invest_cta: string;
  owner_title: string;
  owner_text: string;
  owner_cta: string;
  // imagens do site (URL vinda do painel; vazio = usa a imagem embutida)
  hero_image?: string;
  image_ipanema?: string;
  image_leblon?: string;
  cancel_policy?: string;
  house_checkin?: string;
  house_checkout?: string;
  house_rules?: string;
  weekly_discount?: string;
  monthly_discount?: string;
  ota_savings?: string;
  min_advance_days?: string;   // antecedência mínima de reserva, em dias (1 = ~24h)
  min_nights_global?: string;  // diárias mínimas globais
  // listas em JSON (opcionais — se ausentes, o site usa os defaults embutidos)
  diferenciais_json?: string;
  depoimentos_json?: string;
  faqs_json?: string;
};

/** Parseia uma lista JSON das configurações; usa o fallback se vazio/inválido. */
export function parseList<T>(raw: string | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v : fallback;
  } catch {
    return fallback;
  }
}

export const DEFAULT_SETTINGS: PublicSettings = {
  brand_name: 'MC Flats',
  contact_phone: '+55 21 2523-5959',
  contact_whatsapp: '5521981366864',
  contact_email: 'reservas@mcflats.com.br',
  address: 'Zona Sul · Rio de Janeiro',
  instagram_url: '',
  facebook_url: '',
  cleaning_fee: '180',
  hero_title: 'Apartamentos premium em Ipanema e Leblon',
  hero_subtitle:
    'Hospedagem, locação por temporada e administração de imóveis com a experiência de quem conhece a Zona Sul do Rio há mais de 30 anos.',
  stat_years: '30+',
  stat_rating: '4.9',
  stat_reviews: '1.240',
  institutional_about:
    'Conhecemos cada quadra de Ipanema e Leblon. Cuidamos da hospedagem dos nossos hóspedes e da rentabilidade dos nossos proprietários com a mesma dedicação.',
  dif_eyebrow: 'A experiência MC Flats',
  dif_title: 'Conforto de casa, com serviço de hotel',
  depo_eyebrow: 'Quem se hospeda, volta',
  depo_title: 'Histórias de quem viveu a Zona Sul com a gente',
  invest_eyebrow: 'Compra e venda de apart hotel',
  invest_title: 'Invista em imóveis no Rio de Janeiro',
  invest_subtitle:
    'Ajudamos investidores a comprar e vender unidades de apart hotel em Ipanema e Leblon. São imóveis muito procurados para temporada, com bom potencial de retorno. Cuidamos desde a escolha da unidade até a administração da locação.',
  invest_cta: 'Falar com um consultor',
  owner_title: 'Tem um imóvel na Zona Sul? Deixe ele render.',
  owner_text:
    'Cuidamos da divulgação, das reservas, da hospedagem e do repasse do seu imóvel, com transparência e o conhecimento de quem atua no bairro há mais de 30 anos. Você recebe e a gente opera.',
  owner_cta: 'Anunciar meu imóvel',
  cancel_policy: 'Cancelamento gratuito até 7 dias antes do check-in. Após esse prazo, a primeira diária não é reembolsável.',
  house_checkin: 'a partir das 15h',
  house_checkout: 'até as 11h',
  house_rules: 'Não são permitidas festas ou eventos. Silêncio a partir das 22h. Proibido fumar nas áreas internas do apartamento.',
  weekly_discount: '10',
  monthly_discount: '20',
  ota_savings: '15',
  min_advance_days: '1',
  min_nights_global: '2',
};

type ApiProperty = {
  id: string; name: string; hood: 'ipanema' | 'leblon';
  bedrooms: number; bathrooms: number; guests: number; price: number;
  rating: number; reviews: number; tag: string;
  description?: string; amenities?: string[]; featured?: boolean; min_nights?: number;
  lat?: number | null; lng?: number | null;
  photos: { url: string }[];
};

/**
 * Carrega imóveis + configurações do painel/API. Se a API estiver indisponível,
 * retorna null e o site usa os dados estáticos embutidos (nunca quebra).
 */
export async function loadSiteData(): Promise<{ apts: Apt[]; settings: PublicSettings } | null> {
  try {
    const [props, settings] = await Promise.all([
      fetch(`${API_BASE}/api/public/properties`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`${API_BASE}/api/public/settings`).then((r) => (r.ok ? r.json() : Promise.reject())),
    ]);
    const apts: Apt[] = (props as ApiProperty[]).map((p) => ({
      id: String(p.id), name: p.name, hood: p.hood, bd: p.bedrooms, ba: p.bathrooms,
      guests: p.guests, price: p.price, rating: p.rating, reviews: p.reviews, tag: p.tag || '',
      imgs: p.photos?.length ? p.photos.map((ph) => ph.url) : ['1502672260266-1c1ef2d93688'],
      description: p.description || '', amenities: p.amenities || [], featured: !!p.featured,
      min_nights: p.min_nights || 1, lat: p.lat ?? null, lng: p.lng ?? null,
    }));
    if (!apts.length) return null;
    return { apts, settings: { ...DEFAULT_SETTINGS, ...settings } };
  } catch {
    return null;
  }
}

export { APTS, AMEN };

// ---------------------------------------------------------------- Área do Hóspede
export type Guest = { id: string; name: string; email: string; phone: string };
export type Reservation = {
  id: string; code: string; property_name: string | null; hood?: string;
  checkin: string; checkout: string; guests: number; nights: number;
  total: number; status: 'solicitada' | 'confirmada' | 'cancelada'; created_at: string;
};

async function jreq(path: string, opts: RequestInit = {}) {
  // FormData define o próprio Content-Type (com boundary) — não forçar JSON nesse caso.
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
      // 60s: criar reserva faz 2 chamadas ao Stays (buscar/criar cliente + criar reserva),
      // cada uma até 20s — um timeout curto abortaria o pedido do hóspede no meio.
      signal: opts.signal ?? AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error('Falha de conexão. Verifique sua internet e tente novamente.');
  }
  const text = await res.text();
  // O corpo pode não ser JSON (ex.: 413 de upload grande) — não deixar o JSON.parse mascarar o erro real.
  let data: { error?: string } | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 413) throw new Error('Arquivo muito grande. Envie uma imagem de até 12 MB.');
    throw new Error(data?.error || 'Erro na requisição');
  }
  return data;
}

export const guestApi = {
  me: () => jreq('/api/guest/me') as Promise<{ guest: Guest }>,
  login: (email: string, password: string) =>
    jreq('/api/guest/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ guest: Guest }>,
  google: (payload: { credential?: string; accessToken?: string }) =>
    jreq('/api/guest/google', { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ guest: Guest }>,
  config: () => jreq('/api/public/config') as Promise<{ googleClientId: string }>,
  register: (d: { name: string; email: string; password: string; phone?: string }) =>
    jreq('/api/guest/register', { method: 'POST', body: JSON.stringify(d) }) as Promise<{ guest: Guest }>,
  logout: () => jreq('/api/guest/logout', { method: 'POST' }),
  deleteAccount: () => jreq('/api/guest/me', { method: 'DELETE' }),
  reservations: () => jreq('/api/guest/reservations') as Promise<Reservation[]>,
  createReservation: (d: { property_id: string; checkin: string; checkout: string; guests: number; name: string; email: string; phone: string; cpf: string; payment_method: 'pix' | 'cartao' }) =>
    jreq('/api/reservations', { method: 'POST', body: JSON.stringify(d) }) as Promise<{ id: string; code: string; total: number; nights: number; staysSynced?: boolean; staysCode?: string | null }>,
  uploadDocument: (reservationId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return jreq(`/api/reservations/${reservationId}/document`, { method: 'POST', body: fd }) as Promise<{ ok: boolean }>;
  },
  saveCard: (reservationId: string, card: { titular: string; numero: string; validade: string; cvv: string; bandeira: string }) =>
    jreq(`/api/reservations/${reservationId}/card`, { method: 'POST', body: JSON.stringify(card) }) as Promise<{ ok: boolean }>,
  availability: (propertyId: string) =>
    jreq(`/api/public/availability/${propertyId}`) as Promise<{ start: string; end: string }[]>,
  search: (checkin: string, checkout: string, guests: number) =>
    jreq(`/api/public/search?checkin=${checkin}&checkout=${checkout}&guests=${guests}`) as Promise<Array<{ id: string | number }>>,
  // Preço REAL da estadia (total do Stays nas datas) — bate com o Stays (temporada + taxas).
  price: (propertyId: string, checkin: string, checkout: string, guests: number) =>
    jreq(`/api/public/price?property_id=${encodeURIComponent(propertyId)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`) as Promise<{ total: number; nights: number; fees: number; source: 'stays' | 'flat' }>,
};
