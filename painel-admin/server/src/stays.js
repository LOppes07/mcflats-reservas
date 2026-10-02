// Integração com a Open API do Stays (PMS). Auth = HTTP Basic (client_id:client_secret).
// Base: https://<conta>.stays.net/external/v1/. Credenciais vêm do .env (nunca no código):
//   STAYS_BASE_URL=https://SUACONTA.stays.net
//   STAYS_CLIENT_ID=...
//   STAYS_CLIENT_SECRET=...
// Doc: https://stays.net/external-api/  · credenciais são emitidas pelo suporte do Stays.

const BASE = (process.env.STAYS_BASE_URL || '').replace(/\/+$/, '');
const CLIENT_ID = process.env.STAYS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.STAYS_CLIENT_SECRET || '';

export function staysConfigured() {
  return !!(BASE && CLIENT_ID && CLIENT_SECRET);
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

/** Chamada crua à API do Stays. Lança em erro HTTP. */
export async function staysFetch(path, { method = 'GET', body } = {}) {
  if (!staysConfigured()) throw new Error('Stays não configurado (defina STAYS_BASE_URL/CLIENT_ID/CLIENT_SECRET no .env)');
  const res = await fetch(`${BASE}/external/v1${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw Object.assign(new Error(`Stays: ${msg}`), { status: res.status });
  }
  return data;
}

// ---- helpers de mapeamento ----------------------------------------------------
const stripHtml = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const ML = (obj) => (obj && (obj.pt_BR || obj.en_US || Object.values(obj)[0])) || '';

/** Reescreve URL de imagem do Stays para o domínio real da conta (a doc usa play.stays.net). */
export function rewriteImg(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    try { const u = new URL(url); const b = new URL(BASE); u.protocol = b.protocol; u.host = b.host; return u.toString(); } catch { return url; }
  }
  return `${BASE}/image/${url}`; // veio só o id da imagem
}

/** Coleta URLs de foto de um listing. A galeria completa vem no DETALHE (_t_imagesMeta). */
export function extractPhotos(listing) {
  const out = [];
  // galeria completa (GET /content/listings/{id}) — [{ _id, url, _msname, area }]
  const meta = listing?._t_imagesMeta;
  if (Array.isArray(meta)) {
    const sorted = [...meta].sort((a, b) => (a?.area === 'main' ? -1 : 0) - (b?.area === 'main' ? -1 : 0));
    for (const it of sorted) { const u = it?.url || it?._id; if (u) out.push(rewriteImg(u)); }
  }
  // capa (endpoint de lista) + outros formatos possíveis
  const main = listing?._t_mainImageMeta?.url || listing?._idmainImage;
  if (main) out.push(rewriteImg(main));
  for (const key of ['_t_images', 'images', '_photos', 'photos', 'gallery']) {
    const arr = listing?.[key];
    if (Array.isArray(arr)) for (const it of arr) { const u = it?.url || it?._t_meta?.url || it?._id || it; if (u) out.push(rewriteImg(u)); }
  }
  return [...new Set(out)]; // dedupe, mantém ordem (capa/main primeiro)
}

/** Deriva o bairro do MC Flats (o site só tem 2) a partir do endereço do Stays. */
export function mapHood(address) {
  const region = `${address?.region || ''} ${address?.street || ''} ${address?.city || ''}`.toLowerCase();
  return /leblon/.test(region) ? 'leblon' : 'ipanema';
}

const addressStr = (a) => {
  if (!a) return '';
  return [a.street && `${a.street}${a.streetNumber ? ', ' + a.streetNumber : ''}`, a.region, a.city, a.stateCode]
    .filter(Boolean).join(' · ');
};

/** Converte um listing do Stays no formato do nosso imóvel (campos que conhecemos da doc). */
export function mapListing(l) {
  // Nome público = título multilíngue (melhor que o código interno tipo "IBS101"),
  // sem o prefixo redundante "MC FLATS" (o site já é a marca). Cai no internalName se vazio.
  const title = ML(l._mstitle).replace(/^\s*mc\s*flats\s*[-–—·:|]*\s*/i, '').trim();
  return {
    staysId: l._id,
    // No Stays, status 'active' = anunciado; 'hidden' = inativo (cadastrado, não excluído).
    active: l.status === 'active',
    code: l.id || '',
    name: (title || l.internalName || 'Imóvel Stays').toString().slice(0, 120),
    title: ML(l._mstitle),
    description: stripHtml(ML(l._msdesc)),
    bedrooms: Number(l._i_rooms) || 1,
    bathrooms: Math.max(1, Math.round(Number(l._f_bathrooms) || 1)),
    guests: Number(l._i_maxGuests) || 2,
    hood: mapHood(l.address),
    address: addressStr(l.address),
    lat: l.latLng?._f_lat ?? null,
    lng: l.latLng?._f_lng ?? null,
    photos: extractPhotos(l),
    // preço-base não vem direto no listing (bookingPrice é por período). Fica 0 e é
    // ajustado depois via /prices/listing-sell-prices ou editado no painel.
    price: 0,
  };
}

/** Detalhe de um listing (traz a galeria _t_imagesMeta, amenities, regras). */
export async function fetchListingDetail(id) {
  return staysFetch(`/content/listings/${id}`);
}

/** Extrai a diária (BRL, sem taxas) de uma resposta do calculate-price. */
export function nightlyFromPriceResp(data, from, to) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?._mctotal) return 0;
  const total = Number(row._mctotal.BRL) || 0;
  const fees = Array.isArray(row.fees) ? row.fees.reduce((s, f) => s + (Number(f?._mcval?.BRL) || 0), 0) : 0;
  const nights = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
  return Math.max(0, Math.round((total - fees) / nights));
}

/**
 * Cotação da diária-base de um listing. Tenta várias janelas futuras (5 noites) até
 * achar uma cotável — datas ocupadas ou abaixo do mínimo de noites retornam 0/erro.
 */
export async function fetchListingPrice(id, { guests = 2 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const windows = [[30, 35], [60, 65], [95, 100], [150, 155], [210, 215], [300, 305]];
  const guestOpts = [...new Set([guests, 1])]; // se 2 hóspedes não cotar, tenta 1
  for (const [a, b] of windows) {
    const from = shiftDate(today, a), to = shiftDate(today, b);
    for (const g of guestOpts) {
      try {
        const data = await staysFetch('/booking/calculate-price', { method: 'POST', body: { listingIds: [id], from, to, guests: g } });
        const n = nightlyFromPriceResp(data, from, to);
        if (n > 0) return n;
      } catch { /* tenta próxima combinação */ }
    }
  }
  return 0;
}

/**
 * Cotação REAL de uma estadia exata no Stays (total em BRL, já com taxas/temporada).
 * É a FONTE DA VERDADE do preço — o preço fixo importado não bate com o Stays (temporada + taxas).
 * Retorna { total, fees } ou null se não cotável (datas ocupadas / abaixo do mínimo).
 */
export async function fetchStaysQuote(id, from, to, { guests = 2 } = {}) {
  try {
    const data = await staysFetch('/booking/calculate-price', { method: 'POST', body: { listingIds: [id], from, to, guests } });
    const row = Array.isArray(data) ? data[0] : data;
    const total = Number(row?._mctotal?.BRL);
    if (!Number.isFinite(total) || total <= 0) return null;
    const fees = Array.isArray(row?.fees) ? row.fees.reduce((s, f) => s + (Number(f?._mcval?.BRL) || 0), 0) : 0;
    return { total: Math.round(total), fees: Math.round(fees) };
  } catch {
    return null;
  }
}

/** Busca todos os listings, paginando. */
export async function fetchAllListings({ limit = 50, max = 500 } = {}) {
  const all = [];
  let skip = 0;
  while (all.length < max) {
    const page = await staysFetch(`/content/listings?skip=${skip}&limit=${limit}`);
    const items = Array.isArray(page) ? page : (page?.data || page?.items || []);
    if (!items.length) break;
    all.push(...items);
    if (items.length < limit) break;
    skip += limit;
  }
  return all;
}

function shiftDate(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Converte as reservas do Stays em períodos ocupados {start, end} (fim inclusivo).
 * O checkout não é noite dormida → fim = checkOutDate - 1. Ignora canceladas/orçamentos.
 */
export function reservationsToBlocks(list) {
  const ranges = [];
  for (const r of Array.isArray(list) ? list : []) {
    const type = String(r.type || '').toLowerCase();
    if (/cancel|inquir|quot|declin|expired|abandon/.test(type)) continue; // não ocupa a data
    const ci = r.checkInDate || r.checkin;
    const co = r.checkOutDate || r.checkout;
    if (!ci || !co) continue;
    const end = shiftDate(co, -1);
    if (end >= ci) ranges.push({ start: ci, end });
  }
  return ranges;
}

/** Acha um cliente no Stays pelo e-mail; se não existir, cria. Devolve o _idclient. */
export async function findOrCreateClient({ name, email, phone, cpf }) {
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    try {
      const found = await staysFetch(`/booking/clients?email=${encodeURIComponent(em)}`);
      const arr = Array.isArray(found) ? found : (found?.data || []);
      if (arr.length && arr[0]?._id) return arr[0]._id;
    } catch (e) {
      // Só seguimos para criar se o cliente genuinamente não existe (404). Erro real
      // (500/429/timeout) NÃO deve criar duplicata — propaga e a criação da reserva degrada.
      if (e?.status !== 404) throw e;
    }
  }
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const fName = parts[0] || 'Hóspede';
  const lName = parts.slice(1).join(' ') || fName;
  const body = { kind: 'person', fName, lName, email: em, isUser: false };
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 8) {
    // Stays exige o telefone internacional (E.164) no campo iso (>=8 chars); hint = país.
    const intl = digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
    body.phones = [{ iso: intl, hint: 'BR' }];
  }
  const cpfDigits = String(cpf || '').replace(/\D/g, '');
  if (cpfDigits.length === 11) body.documents = [{ type: 'cpf', numb: cpfDigits }];
  const created = await staysFetch('/booking/clients', { method: 'POST', body });
  const id = created?._id || created?.id;
  if (!id) throw new Error('Stays não retornou o id do cliente');
  return id;
}

/**
 * Cria a reserva no Stays como PRÉ-RESERVA (type 'reserved') — entra no PMS do cliente
 * para o gestor confirmar (sem pagamento online ela não deve ir como 'booked').
 */
export async function createStaysReservation({ listingId, checkin, checkout, guests, idclient, note }) {
  const g = Math.max(1, Number(guests) || 1);
  const r = await staysFetch('/booking/reservations', {
    method: 'POST',
    body: {
      type: 'reserved',
      listingId,
      checkInDate: checkin,
      checkOutDate: checkout,
      guests: g,
      guestsDetails: { adults: g, children: 0 },
      _idclient: idclient,
      internalNote: note || 'Reserva solicitada pelo site MC Flats',
    },
  });
  return { id: r?._id || null, code: r?.id || r?.partnerCode || null };
}

/** Cancela uma reserva no Stays (usado em limpeza/gestão). */
export async function cancelStaysReservation(reservationId, message) {
  return staysFetch(`/booking/reservations/${reservationId}`, { method: 'PATCH', body: { type: 'canceled', cancelMessage: message || 'Cancelada' } });
}

/** Disponibilidade real de um listing = suas reservas ocupam as datas.
 *  Pagina (skip) até esgotar — com limite fixo de 100, um imóvel de alta temporada com
 *  >100 reservas na janela perdia as demais e liberava datas ocupadas. Guarda de 40 páginas
 *  evita loop infinito caso a API ignore o `skip`. */
export async function fetchListingBlocks(listingId, from, to) {
  const all = [];
  const limit = 100;
  for (let page = 0; page < 40; page++) {
    const skip = page * limit;
    const data = await staysFetch(`/booking/reservations?listingId=${listingId}&from=${from}&to=${to}&dateType=arrival&limit=${limit}&skip=${skip}`);
    const arr = Array.isArray(data) ? data : (data?.data || data?.items || []);
    all.push(...arr);
    if (arr.length < limit) break;
  }
  return reservationsToBlocks(all);
}
