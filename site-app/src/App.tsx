import { useEffect, useMemo, useRef, useState } from 'react';
import { css, Box } from './css';
import { APTS, AMEN, type Apt } from './data';
import { loadSiteData, DEFAULT_SETTINGS, parseList, guestApi, type PublicSettings } from './apiData';
import { useGuest, AuthModal, AccountModal, PrivacyModal } from './guest';
import { PriceCalendar, DateRangeField } from './calendar';
import { Lightbox } from './lightbox';
import { imgU } from './photos';

import logoHeader from './images/logo-header.png';
import logoFooter from './images/logo-footer.png';
import heroImg from './images/hero.jpg';
import ipanemaImg from './images/ipanema.png';
import leblonImg from './images/leblon.png';

const WA_NUMBER = '5521981366864';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const fmt = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR');
const fmtDate = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return s;
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
};
const bdLabel = (bd: number) => (bd === 0 ? 'Studio' : bd + ' quarto' + (bd > 1 ? 's' : ''));

/** Máscara e validação de CPF. */
const maskCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const isValidCpf = (v: string) => {
  const c = v.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
};

/** Código de reserva estável derivado do id (string) do imóvel. */
const bookingCode = (id: string | null) => {
  const seed = id ? Array.from(id).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) : 0;
  return 'MC' + (1000 + (seed % 9000));
};
const hoodLabel = (h: string) =>
  h === 'ipanema' ? 'Ipanema' : h === 'leblon' ? 'Leblon' : 'Ipanema & Leblon';

/** ISO date (yyyy-mm-dd) N days from today — keeps the default search window in the future. */
const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const TODAY_ISO = isoDate(0);
const DEFAULT_CHECKIN = isoDate(7);
const DEFAULT_CHECKOUT = isoDate(13);

/** Favorites persist across reloads via localStorage. */
const FAVS_KEY = 'mcflats:favs';
const loadFavs = (): string[] => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FAVS_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
};

const chip = (active: boolean) => {
  const base =
    'font:700 13px/1 Manrope,sans-serif; border-radius:100px; padding:11px 20px; cursor:pointer; transition:all .2s ease;';
  return active
    ? base + ' color:#fff; background:#15499a; border:1.5px solid #15499a;'
    : base + ' color:#1c3a5f; background:#fff; border:1.5px solid #e2ebf4;';
};

type Screen = 'home' | 'results' | 'detail';

// Filtros de comodidade (rótulo → palavra-chave casada contra as comodidades do imóvel).
const AMEN_FILTERS: [string, string][] = [
  ['Piscina', 'piscina'], ['Academia', 'academia'], ['Pet friendly', 'pet'],
  ['Vista mar', 'vista mar'], ['Varanda', 'varanda'], ['Ar-condicionado', 'ar-condicionado'],
  ['Vaga privativa', 'vaga'], ['Máquina de lavar', 'lavar'],
];
const fchip = (active: boolean) =>
  `font:600 12.5px/1 'Manrope',sans-serif; border-radius:100px; padding:9px 15px; cursor:pointer; transition:all .15s ease; ${active ? 'color:#fff; background:#15499a; border:1.5px solid #15499a;' : 'color:#42556b; background:#fff; border:1.5px solid #e2ebf4;'}`;

/** Responsive breakpoint hook — mobile under 760px (same threshold as the hero parallax). */
function useIsMobile(bp = 760) {
  const [mob, setMob] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const on = () => setMob(window.innerWidth < bp);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return mob;
}

function useApp(apts: Apt[], settings: PublicSettings) {
  const waNumber = settings.contact_whatsapp || WA_NUMBER;
  const [screen, setScreen] = useState<Screen>('home');
  const [hood, setHood] = useState<'all' | 'ipanema' | 'leblon'>('all');
  const [sort, setSort] = useState<'rel' | 'low' | 'high' | 'rate'>('rel');
  const [favView, setFavView] = useState(false);
  const [amenF, setAmenF] = useState<string[]>([]); // comodidades filtradas (keywords)
  const [minBd, setMinBd] = useState(0);            // mínimo de quartos
  const [maxPrice, setMaxPrice] = useState(0);      // preço máximo (0 = sem limite)
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gi, setGi] = useState(0);
  const [checkin, setCheckin] = useState(DEFAULT_CHECKIN);
  const [checkout, setCheckout] = useState(DEFAULT_CHECKOUT);
  const [guests, setGuests] = useState(2);
  // Busca com datas: quando ativa, filtra por disponibilidade real (availIds) + capacidade.
  const [dateSearch, setDateSearch] = useState(false);
  const [availIds, setAvailIds] = useState<string[] | null>(null);
  const [booking, setBooking] = useState(false);
  // Preço REAL da estadia vindo do Stays (total nas datas escolhidas). null = usa o fixo.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [bStep, setBStep] = useState(1);
  const [form, setForm] = useState({ nome: '', email: '', tel: '', cpf: '' });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<{ nome?: string; email?: string; tel?: string; cpf?: string; consent?: string }>({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Persist favorites whenever they change.
  useEffect(() => {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch { /* noop */ }
  }, [favs]);

  // Busca o TOTAL real do Stays sempre que o imóvel aberto ou as datas mudam (fonte da verdade do preço).
  useEffect(() => {
    if (!activeId || !(checkin < checkout)) { setLivePrice(null); return; }
    let alive = true;
    guestApi.price(activeId, checkin, checkout, guests)
      .then((r) => { if (alive) setLivePrice(r && r.total > 0 ? r.total : null); })
      .catch(() => { if (alive) setLivePrice(null); });
    return () => { alive = false; };
  }, [activeId, checkin, checkout, guests]);

  const scrollTop = () => { try { window.scrollTo(0, 0); } catch { /* noop */ } };

  const nights = () => {
    const a = new Date(checkin), b = new Date(checkout);
    const n = Math.round((b.getTime() - a.getTime()) / 86400000);
    return n > 0 ? n : 6;
  };

  const toggleFav = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const has = favs.includes(id);
    setFavs(has ? favs.filter((x) => x !== id) : [...favs, id]);
    setToast(has ? '' : 'Salvo nos favoritos');
    if (!has) {
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 1900);
    }
  };

  const openApt = (id: string) => { setScreen('detail'); setActiveId(id); setGi(0); scrollTop(); };
  const goBack = () => { setScreen('results'); scrollTop(); };

  const mapApt = (a: Apt) => {
    const has = favs.includes(a.id);
    return {
      id: a.id, name: a.name, hood: a.hood, reviews: a.reviews, tag: a.tag,
      cover: imgU(a.imgs[0]),
      priceFmt: a.price > 0 ? fmt(a.price) : 'Sob consulta',
      hasPrice: a.price > 0,
      ratingFmt: a.rating.toFixed(1),
      meta: bdLabel(a.bd) + ' · ' + a.ba + ' banheiro' + (a.ba > 1 ? 's' : '') + ' · ' + a.guests + ' hóspedes',
      heart: has ? '#e0556a' : '#15499a',
      heartIcon: has ? '♥' : '♡',
      open: () => openApt(a.id),
      toggleFav: (e?: React.MouseEvent) => toggleFav(a.id, e),
    };
  };

  const toggleAmen = (kw: string) => setAmenF((s) => (s.includes(kw) ? s.filter((x) => x !== kw) : [...s, kw]));
  const clearFilters = () => { setAmenF([]); setMinBd(0); setMaxPrice(0); };

  const filtered = () => {
    let l = apts.slice();
    if (favView) l = l.filter((a) => favs.includes(a.id));
    else if (hood !== 'all') l = l.filter((a) => a.hood === hood);
    // Busca com datas: só disponíveis no período (availIds), capacidade >= e com preço
    // (sem "sob consulta"). Navegação por bairro (sem datas) mostra tudo, inclusive sob consulta.
    if (dateSearch) {
      if (availIds) l = l.filter((a) => availIds.includes(a.id) && a.price > 0);
      else l = l.filter((a) => a.guests >= guests && a.price > 0);
    }
    if (amenF.length) l = l.filter((a) => amenF.every((kw) => (a.amenities || []).some((am) => am.toLowerCase().includes(kw))));
    if (minBd) l = l.filter((a) => a.bd >= minBd);
    if (maxPrice) l = l.filter((a) => a.price <= maxPrice);
    if (sort === 'low') l.sort((a, b) => a.price - b.price);
    else if (sort === 'high') l.sort((a, b) => b.price - a.price);
    else if (sort === 'rate') l.sort((a, b) => b.rating - a.rating);
    return l;
  };

  const validate = () => {
    const f = form;
    const e: typeof err = {};
    if (!f.nome || f.nome.trim().length < 2) e.nome = 'Informe seu nome completo';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) e.email = 'E-mail inválido';
    if (!f.tel || f.tel.replace(/\D/g, '').length < 10) e.tel = 'Telefone inválido';
    if (!isValidCpf(f.cpf || '')) e.cpf = 'CPF inválido';
    if (!consent) e.consent = 'É necessário aceitar a Política de Privacidade para continuar';
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const whats = (a: Apt) => {
    const msg =
      'Olá! Tenho interesse no ' + a.name + ' (' + hoodLabel(a.hood) + ') de ' +
      fmtDate(checkin) + ' a ' + fmtDate(checkout) + ', ' + guests +
      ' hóspedes. Pode confirmar a disponibilidade?';
    try { window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg), '_blank'); } catch { /* noop */ }
  };

  // Entrega o pedido completo (dados + datas + total + código + método de pagamento) ao
  // WhatsApp da MC Flats — a equipe (Fernando) confirma manualmente. A reserva NUNCA é
  // confirmada automaticamente no site.
  const sendLead = (a: Apt, payMethod?: 'pix' | 'cartao', codeArg?: string) => {
    const n = nights();
    // Total = preço real do Stays nas datas (livePrice); fallback pro fixo × noites.
    const total = livePrice != null ? fmt(livePrice) : (a.price > 0 ? fmt(a.price * n) : 'Sob consulta');
    const code = codeArg || bookingCode(a.id);
    const metodo = payMethod === 'pix' ? 'Pix' : payMethod === 'cartao' ? 'Cartão' : 'A combinar';
    const lines = [
      'Olá! Quero solicitar uma reserva na MC Flats.',
      '',
      'Apartamento: ' + a.name + ' (' + hoodLabel(a.hood) + ')',
      'Check-in: ' + fmtDate(checkin),
      'Check-out: ' + fmtDate(checkout),
      'Noites: ' + n,
      'Hóspedes: ' + guests,
      'Total estimado: ' + total,
      'Código: ' + code,
      '',
      'Meus dados',
      'Nome: ' + form.nome,
      'CPF: ' + form.cpf,
      'E-mail: ' + form.email,
      'Telefone: ' + form.tel,
      '',
      'Método de pagamento: ' + metodo,
    ];
    try { window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(lines.join('\n')), '_blank'); } catch { /* noop */ }
  };

  return {
    screen, setScreen, hood, setHood, sort, setSort, favView, setFavView,
    favs, activeId, setActiveId, gi, setGi, checkin, setCheckin, checkout, setCheckout,
    guests, setGuests, booking, setBooking, bStep, setBStep, form, setForm, err, setErr,
    dateSearch, setDateSearch, availIds, setAvailIds, livePrice,
    consent, setConsent, toast, scrollTop, nights, toggleFav, openApt, goBack, mapApt,
    filtered, validate, whats, sendLead,
    amenF, toggleAmen, minBd, setMinBd, maxPrice, setMaxPrice, clearFilters,
  };
}

/* ---------- Apartment card (featured + results) ---------- */
function AptCard({ m, variant }: { m: ReturnType<ReturnType<typeof useApp>['mapApt']>; variant: 'feat' | 'list' }) {
  const feat = variant === 'feat';
  return (
    <Box
      onClick={m.open}
      style={`background:#fff; border:1px solid #e7eef5; border-radius:${feat ? '14px' : '16px'}; overflow:hidden; cursor:pointer; transition:transform .25s ease, box-shadow .25s ease;`}
      hover={`transform:translateY(-4px); box-shadow:0 ${feat ? '20px 40px' : '22px 44px'} -22px rgba(28,58,95,.45);`}
    >
      <div style={css(`position:relative; aspect-ratio:${feat ? '4/3' : '3/2'}; overflow:hidden;`)}>
        <img src={m.cover} alt={m.name} loading="lazy" decoding="async" style={css('width:100%; height:100%; object-fit:cover; display:block;')} />
        <span style={css(`position:absolute; top:${feat ? '12px' : '14px'}; left:${feat ? '12px' : '14px'}; font:700 ${feat ? '10px' : '10.5px'}/1 'Manrope',sans-serif; color:#15499a; background:rgba(255,255,255,.95); border-radius:100px; padding:${feat ? '6px 11px' : '7px 13px'}; text-transform:capitalize;`)}>{m.hood}</span>
        <span onClick={m.toggleFav} style={css(`position:absolute; top:${feat ? '10px' : '12px'}; right:${feat ? '10px' : '12px'}; width:${feat ? '32px' : '36px'}; height:${feat ? '32px' : '36px'}; border-radius:50%; background:rgba(255,255,255,.95); display:flex; align-items:center; justify-content:center; font:400 ${feat ? '16px' : '18px'}/1 serif; color:${m.heart}; cursor:pointer;`)}>{m.heartIcon}</span>
        {!feat && m.tag ? (
          <span style={css("position:absolute; bottom:14px; left:14px; font:700 10.5px/1 'Manrope',sans-serif; color:#1c3a5f; background:#e3c074; border-radius:100px; padding:7px 13px;")}>{m.tag}</span>
        ) : null}
      </div>
      <div style={css(feat ? 'padding:16px 16px 18px;' : 'padding:18px 18px 20px;')}>
        <div style={css(`display:flex; align-items:center; gap:6px; margin-bottom:${feat ? '8px' : '9px'};`)}>
          {m.reviews > 0 ? (
            <>
              <span style={css(`font:700 ${feat ? '12px' : '13px'}/1 'Manrope',sans-serif; color:#1c3a5f;`)}><span style={css('color:#d6ad63;')}>★</span> {m.ratingFmt}</span>
              <span style={css(`font:400 ${feat ? '12px' : '13px'}/1 'Manrope',sans-serif; color:#9aa9bb;`)}>({m.reviews})</span>
            </>
          ) : (
            <span style={css(`font:700 ${feat ? '10.5px' : '11px'}/1 'Montserrat',sans-serif; letter-spacing:.12em; text-transform:uppercase; color:#15499a;`)}>{hoodLabel(m.hood)}</span>
          )}
        </div>
        <div style={css(`font:700 ${feat ? '15px' : '17px'}/1.3 'Manrope',sans-serif; color:#1c3a5f; margin-bottom:8px;`)}>{m.name}</div>
        <div style={css(`font:400 ${feat ? '12.5px' : '13px'}/1 'Manrope',sans-serif; color:#5a6b80; margin-bottom:${feat ? '14px' : '16px'};`)}>{m.meta}</div>
        <div style={css(`display:flex; align-items:baseline; justify-content:space-between; border-top:1px solid #eef3f8; padding-top:${feat ? '13px' : '14px'};`)}>
          <div>
            <span style={css(`font:800 ${feat ? '17px' : '19px'}/1 'Montserrat',sans-serif; color:#1c3a5f;`)}>{m.priceFmt}</span>
            {m.hasPrice && <span style={css(`font:400 ${feat ? '12px' : '12.5px'}/1 'Manrope',sans-serif; color:#9aa9bb;`)}> /noite</span>}
          </div>
          <span style={css(`font:700 ${feat ? '12.5px' : '13px'}/1 'Manrope',sans-serif; color:#15499a;`)}>{feat ? 'Ver →' : 'Ver detalhes →'}</span>
        </div>
      </div>
    </Box>
  );
}

/* ---------- conteúdo institucional (marketing) ---------- */
const ICON: Record<string, string> = {
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.4L22 18l-2.1.8L19 21l-.9-2.2L16 18l2.1-.6z',
  work: 'M4 5h16v11H4zM2 20h20M9 20v-4M15 20v-4',
  kitchen: 'M6 3v7a3 3 0 0 0 3 3v8M9 3v5M12 3v5M18 3c-1.5 0-2 2-2 5s.5 4 2 4v9',
  car: 'M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13v5h-2v-2H7v2H5zM7.5 16h.01M16.5 16h.01',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  pet: 'M4.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 21c3 0 5-1.7 5-3.8 0-1.7-1.4-2.7-2.6-3.6-.8-.6-1.5-1.4-2.4-1.4s-1.6.8-2.4 1.4C6.4 14.5 5 15.5 5 17.2 5 19.3 9 21 12 21z',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  key: 'M15 7a4 4 0 1 0-3.9 5L8 15l-2 2 1 3 3-1 5-5A4 4 0 0 0 15 7z',
};
function Ic({ d, size = 22, color = '#15499a' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type Dif = { icon: string; title: string; desc: string };
type Depo = { name: string; city: string; text: string };
type Faq = { q: string; a: string };

const DIFERENCIAIS: Dif[] = [
  { icon: 'sparkle', title: 'Serviço de arrumação', desc: 'Apartamento sempre limpo e organizado, com o cuidado diário de um hotel.' },
  { icon: 'work', title: 'Espaço para trabalho', desc: 'Estação de trabalho e internet de alta velocidade em todas as unidades.' },
  { icon: 'kitchen', title: 'Cozinha completa', desc: 'Utensílios e eletrodomésticos prontos para você cozinhar à vontade.' },
  { icon: 'car', title: 'Vaga privativa', desc: 'Estacionamento incluso para você chegar de carro sem preocupação.' },
  { icon: 'clock', title: 'Recepção 24 horas', desc: 'Atendimento a qualquer hora, com check-in noturno quando você precisar.' },
  { icon: 'pet', title: 'Pet friendly', desc: 'Unidades selecionadas recebem o seu melhor amigo de quatro patas.' },
];

const DEPOIMENTOS: Depo[] = [
  { name: 'Marina A.', city: 'São Paulo', text: 'Apartamento impecável, a duas quadras da praia de Ipanema. A recepção 24h fez toda a diferença na nossa chegada de madrugada. Voltaremos com certeza!' },
  { name: 'Carlos R.', city: 'Buenos Aires', text: 'Fiquei um mês a trabalho no Leblon. A estação de trabalho e a internet foram perfeitas, e a arrumação diária deixou tudo leve. Serviço de hotel com conforto de casa.' },
  { name: 'Juliana e Pedro', city: 'Belo Horizonte', text: 'Lua de mel no Beach Star. Vista linda, tudo limpo e a equipe super atenciosa pelo WhatsApp. Recomendo de olhos fechados.' },
];

const FAQS: Faq[] = [
  { q: 'Como faço uma reserva?', a: 'Escolha o apartamento, as datas e o número de hóspedes e clique em Reservar. Você finaliza pelo WhatsApp com a nossa equipe, que confirma a disponibilidade na hora, sem enrolação.' },
  { q: 'Qual o horário de check-in e check-out?', a: 'Check-in a partir das 15h e check-out até as 11h. Como temos recepção 24 horas, conseguimos receber chegadas noturnas com aviso prévio.' },
  { q: 'Os apartamentos têm Wi-Fi e espaço para trabalhar?', a: 'Sim. Todas as unidades têm internet rápida e uma estação de trabalho, ótimas para uma viagem de lazer ou para trabalhar de casa por mais tempo.' },
  { q: 'Aceitam animais de estimação?', a: 'Algumas unidades são pet friendly. Fale com a gente pelo WhatsApp antes de reservar que indicamos os apartamentos disponíveis para o seu pet.' },
  { q: 'Vocês administram imóveis de proprietários?', a: 'Sim. Cuidamos da divulgação, das reservas, da hospedagem e do repasse do seu imóvel, com mais de 30 anos de bairro na Zona Sul do Rio.' },
  { q: 'Como funciona a compra e venda de apart hotel?', a: 'Assessoramos investidores na compra e venda de unidades de apart hotel no Rio, com ótimo potencial de rentabilidade por temporada. Fale com a nossa equipe para as oportunidades atuais.' },
];

function FaqItem({ q, a, mobile }: { q: string; a: string; mobile: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={css('border-bottom:1px solid #e7eef5;')}>
      <Box onClick={() => setOpen((o) => !o)} style={`display:flex; align-items:center; justify-content:space-between; gap:16px; padding:${mobile ? '18px 4px' : '22px 6px'}; cursor:pointer;`} hover="color:#15499a;">
        <span style={css(`font:700 ${mobile ? '15px' : '16.5px'}/1.4 'Manrope',sans-serif; color:#1c3a5f;`)}>{q}</span>
        <span style={css(`flex:none; width:26px; height:26px; border-radius:50%; border:1.5px solid ${open ? '#15499a' : '#d4e0ec'}; color:#15499a; display:flex; align-items:center; justify-content:center; font:400 18px/1 'Manrope',sans-serif; transition:all .2s ease; transform:rotate(${open ? '45deg' : '0deg'});`)}>+</span>
      </Box>
      {open && <div style={css(`font:400 ${mobile ? '14px' : '15px'}/1.7 'Manrope',sans-serif; color:#5a6b80; padding:0 6px 22px; max-width:760px; animation:fadeIn .25s ease both;`)}>{a}</div>}
    </div>
  );
}

const HICON = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
const Sv = ({ d, s = 19, fill = 'none' }: { d: string; s?: number; fill?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const HBTN = "display:flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:11px; border:1.5px solid #e7eef5; background:transparent; cursor:pointer; color:#1c3a5f; text-decoration:none; transition:all .18s ease;";

export default function App() {
  // Dados vêm do painel/API; fallback para os dados estáticos embutidos (nunca quebra).
  const [site, setSite] = useState<{ apts: Apt[]; settings: PublicSettings }>({ apts: APTS, settings: DEFAULT_SETTINGS });
  useEffect(() => { loadSiteData().then((d) => d && setSite(d)); }, []);
  const { settings } = site;
  // Conteúdo de marketing editável pelo painel (com fallback embutido).
  const diferenciais = parseList<Dif>(settings.diferenciais_json, DIFERENCIAIS);
  const depoimentos = parseList<Depo>(settings.depoimentos_json, DEPOIMENTOS);
  const faqs = parseList<Faq>(settings.faqs_json, FAQS);

  const A = useApp(site.apts, settings);
  const {
    screen, hood, sort, favView, favs, activeId, gi, checkin, checkout, guests,
    booking, bStep, form, err, toast,
  } = A;

  const m = useIsMobile();
  const g = useGuest();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [waHidden, setWaHidden] = useState(false);
  const bookingRef = useRef<HTMLDivElement>(null);
  const [bookErr, setBookErr] = useState('');
  const [payMethod, setPayMethod] = useState<'' | 'pix' | 'cartao'>('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docConsent, setDocConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState({ titular: '', numero: '', validade: '', cvv: '', bandeira: '' });
  const cd = (k: keyof typeof card, v: string) => setCard((c) => ({ ...c, [k]: v }));

  // No mobile, esconde o WhatsApp flutuante quando o CARD DE RESERVA entra na tela ou perto do
  // rodapé (onde já há WhatsApp), pra não cobrir os botões. No desktop fica sempre visível.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      if (!m) { setWaHidden(false); return; }
      const nearBottom = (window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 200;
      const bookingVisible = bookingRef.current ? bookingRef.current.getBoundingClientRect().top < window.innerHeight - 80 : false;
      setWaHidden(nearBottom || bookingVisible);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [screen, activeId, m]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [avail, setAvail] = useState<{ start: string; end: string }[]>([]);
  const padX = m ? '20px' : '56px'; // standard page horizontal padding

  /* hero parallax (throttle com rAF pra não engasgar/piscar no scroll) */
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const img = heroRef.current;
      if (!img) return;
      const y = window.scrollY || window.pageYOffset || 0;
      const wide = window.innerWidth >= 760;
      img.style.transform = wide
        ? `translate3d(0,${y * 0.4}px,0) scale(${1 + Math.min(y, 900) / 4500})`
        : '';
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [screen]);

  /* disponibilidade do imóvel aberto (datas bloqueadas/reservadas) */
  useEffect(() => {
    if (!activeId) { setAvail([]); return; }
    guestApi.availability(activeId).then(setAvail).catch(() => setAvail([]));
  }, [activeId]);

  /* derived */
  const list = A.filtered().map(A.mapApt);
  // Destaques: imóveis marcados no painel; se nenhum, escolhe automaticamente por selo/nota.
  const marked = site.apts.filter((a) => a.featured);
  const feat = (marked.length
    ? marked.slice(0, 8)
    : [...site.apts].sort((a, b) => (b.tag ? 1 : 0) - (a.tag ? 1 : 0) || b.rating - a.rating).slice(0, 4)
  ).map(A.mapApt);
  const favCount = favs.length;
  const searchSummary = list.length + ' apartamentos · ' + fmtDate(checkin) + ' até ' + fmtDate(checkout) + ' · ' + guests + ' hóspedes';
  const resultsTitle = favView ? 'Seus favoritos' : 'Apartamentos em ' + hoodLabel(hood);

  const act = site.apts.find((a) => a.id === activeId) || null;
  const detail = useMemo(() => {
    if (!act) return null;
    const n = A.nights();
    const sub = act.price * n;
    // Total real do Stays nas datas (livePrice) quando disponível; senão fixo × noites.
    const grand = A.livePrice != null ? A.livePrice : sub;
    const has = favs.includes(act.id);
    const m = A.mapApt(act);
    return {
      ...m,
      ba: act.ba, baS: act.ba > 1 ? 's' : '', guests: act.guests,
      bdLabel: bdLabel(act.bd),
      desc: act.description?.trim()
        ? act.description
        : 'Apartamento a poucos passos da praia ' +
          (act.hood === 'ipanema' ? 'de Ipanema' : 'do Leblon') +
          ', com sala arejada, cozinha completa e arrumação diária. Tem recepção 24 horas e internet rápida, ótimo tanto para férias quanto para estadias mais longas na Zona Sul do Rio.',
      amenities: act.amenities?.length ? act.amenities : AMEN,
      gImg: imgU(act.imgs[gi]),
      galleryPos: gi + 1 + ' / ' + act.imgs.length,
      mapImg: imgU(act.hood === 'ipanema' ? '1516306580123-e6e52b1b7b5f' : '1544989164-31dc3c645987'),
      lat: act.lat ?? null, lng: act.lng ?? null,
      thumbs: act.imgs.map((id, i) => ({
        url: imgU(id), i,
        border: i === gi ? '2.5px solid #15499a' : '2.5px solid transparent',
        pick: () => A.setGi(i),
      })),
      nights: n,
      subFmt: fmt(sub),
      totalFmt: grand > 0 ? fmt(grand) : 'Sob consulta',
      minNights: Math.max(act.min_nights || 1, Number(settings.min_nights_global) || 1),
      priceNum: act.price,
      perNightLine: A.livePrice != null && grand > 0
        ? fmt(grand) + ' · ' + n + ' noites (com taxas)'
        : (act.price > 0 ? fmt(act.price) : 'Sob consulta') + ' × ' + n + ' noites',
      next: () => A.setGi((gi + 1) % act.imgs.length),
      prev: () => A.setGi((gi - 1 + act.imgs.length) % act.imgs.length),
      reserve: () => { A.setBooking(true); A.setBStep(1); A.setErr({}); setBookErr(''); },
      whats: () => A.whats(act),
      toggleFav: (e?: React.MouseEvent) => A.toggleFav(act.id, e),
    };
  }, [act, gi, favs, checkin, checkout, settings, A.livePrice]);

  const activeCode = bookingCode(activeId);
  const bd = (field: 'nome' | 'email' | 'tel' | 'cpf') => (err[field] ? '#e0a0a0' : '#e2ebf4');

  /* navigation */
  const goHome = () => { A.setScreen('home'); A.scrollTop(); };
  // Navegação por bairro = SEM datas: mostra tudo (inclusive "sob consulta").
  const goResults = () => { A.setScreen('results'); A.setFavView(false); A.setHood('all'); A.setDateSearch(false); A.scrollTop(); };
  const goIpanema = () => { A.setScreen('results'); A.setFavView(false); A.setHood('ipanema'); A.setDateSearch(false); A.scrollTop(); };
  const goLeblon = () => { A.setScreen('results'); A.setFavView(false); A.setHood('leblon'); A.setDateSearch(false); A.scrollTop(); };
  const goFavs = () => { A.setScreen('results'); A.setFavView(true); A.setDateSearch(false); A.scrollTop(); };
  // Buscar = COM datas: consulta disponibilidade real e capacidade no servidor.
  const doSearch = async () => {
    A.setScreen('results'); A.setFavView(false); A.setHood('all'); A.setDateSearch(true); A.setAvailIds(null); A.scrollTop();
    try { const r = await guestApi.search(checkin, checkout, guests); A.setAvailIds(r.map((x) => String(x.id))); }
    catch { A.setAvailIds(null); }
  };
  // Rola até uma seção do home (voltando ao home antes, se necessário).
  const goSection = (id: string) => {
    const doScroll = () => { try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* noop */ } };
    if (screen === 'home') doScroll();
    else { A.setScreen('home'); setTimeout(doScroll, 70); }
  };
  const setHoodAll = () => { A.setHood('all'); A.setFavView(false); };
  const setHoodIp = () => { A.setHood('ipanema'); A.setFavView(false); };
  const setHoodLe = () => { A.setHood('leblon'); A.setFavView(false); };
  const gMinus = () => A.setGuests(Math.max(1, guests - 1));
  const gPlus = () => A.setGuests(Math.min(8, guests + 1));
  // Etapa 1 → 2: valida os dados e vai para a forma de pagamento.
  const goToPayment = () => { if (!A.validate()) return; setBookErr(''); setPayMethod(''); setDocFile(null); setDocConsent(false); setCard({ titular: '', numero: '', validade: '', cvv: '', bandeira: '' }); A.setBStep(2); };

  // Etapa 2 → 3: grava a reserva (nosso sistema + pré-reserva no Stays), anexa o documento
  // (fluxo cartão) e ABRE O WHATSAPP com a mensagem pronta. A equipe confirma manualmente.
  const finalize = async () => {
    if (!payMethod) { setBookErr('Escolha a forma de pagamento.'); return; }
    if (payMethod === 'cartao') {
      const numDigits = card.numero.replace(/\D/g, '');
      if (!card.titular.trim()) { setBookErr('Informe o nome do titular do cartão.'); return; }
      if (numDigits.length < 13 || numDigits.length > 19) { setBookErr('Número do cartão inválido.'); return; }
      if (!/^\d{2}\/?\d{2,4}$/.test(card.validade.trim())) { setBookErr('Validade inválida (use MM/AA).'); return; }
      if (!/^\d{3,4}$/.test(card.cvv.trim())) { setBookErr('CVV inválido.'); return; }
      if (!docFile) { setBookErr('Anexe a foto do documento (RG ou CNH) do titular.'); return; }
      if (!docConsent) { setBookErr('É preciso autorizar o uso do documento para continuar.'); return; }
    }
    setBookErr(''); setSubmitting(true);
    let code = act ? bookingCode(act.id) : '';
    if (act) {
      try {
        const res = await guestApi.createReservation({
          property_id: act.id, checkin, checkout, guests,
          name: form.nome, email: form.email, phone: form.tel, cpf: form.cpf, payment_method: payMethod,
        });
        code = res.code || code;
        if (payMethod === 'cartao' && docFile) { try { await guestApi.uploadDocument(res.id, docFile); } catch { /* doc opcional em falha */ } }
        if (payMethod === 'cartao') {
          try {
            await guestApi.saveCard(res.id, {
              titular: card.titular.trim(), numero: card.numero.replace(/\D/g, ''),
              validade: card.validade.trim(), cvv: card.cvv.trim(), bandeira: card.bandeira.trim(),
            });
          } catch { /* se falhar, segue pro WhatsApp; a equipe pede os dados por lá */ }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        // regra de negócio (datas ocupadas, 48h, CPF, min noites) → barra e mostra.
        // Falha de rede/timeout → NÃO barra: segue pro WhatsApp (a equipe recebe o pedido).
        if (msg && !/failed to fetch|networkerror|load failed|falha de conex|conex[aã]o/i.test(msg)) { setBookErr(msg); setSubmitting(false); return; }
        // API fora do ar → segue mesmo assim pro WhatsApp (a equipe recebe o pedido)
      }
    }
    setSubmitting(false);
    if (act) A.sendLead(act, payMethod, code);   // abre o WhatsApp com tudo preenchido
    A.setBStep(3);
  };
  const bkHome = () => { A.setBooking(false); A.setScreen('home'); A.scrollTop(); };
  const waGeneral = () => { try { window.open('https://wa.me/' + (settings.contact_whatsapp || WA_NUMBER), '_blank'); } catch { /* noop */ } };

  return (
    <div style={css('min-height:100vh; background:#fff;')}>

      {/* ============ HEADER ============ */}
      <div style={css(`position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; padding:${m ? '11px 20px' : '14px 48px'}; background:rgba(255,255,255,.92); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-bottom:1px solid #eef3f8;`)}>
        <img src={logoHeader} alt="MC Flats — página inicial" onClick={goHome} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } }} style={css(`height:${m ? '36px' : '44px'}; width:auto; cursor:pointer;`)} />
        <div style={css(`display:${m ? 'none' : 'flex'}; gap:30px; font:600 14px/1 'Manrope',sans-serif; color:#1c3a5f;`)}>
          <Box as="span" onClick={goIpanema} style="cursor:pointer;" hover="color:#15499a;">Ipanema</Box>
          <Box as="span" onClick={goLeblon} style="cursor:pointer;" hover="color:#15499a;">Leblon</Box>
          <Box as="span" onClick={goResults} style="cursor:pointer;" hover="color:#15499a;">Apartamentos</Box>
          <Box as="span" onClick={() => goSection('faq')} style="cursor:pointer;" hover="color:#15499a;">Dúvidas</Box>
          <Box as="span" onClick={() => goSection('contato')} style="cursor:pointer;" hover="color:#15499a;">Contato</Box>
        </div>
        <div style={css(`display:flex; align-items:center; gap:${m ? '8px' : '10px'};`)}>
          <Box as="button" onClick={goFavs} title="Favoritos" style={`position:relative; ${HBTN}`} hover="border-color:#15499a; color:#15499a;">
            <Sv d={HICON.heart} fill={favCount > 0 ? 'currentColor' : 'none'} />
            {favCount > 0 && <span style={css("position:absolute; top:-6px; right:-6px; min-width:18px; height:18px; padding:0 4px; border-radius:100px; background:#d6ad63; color:#12305a; font:800 10px/18px 'Manrope',sans-serif; text-align:center;")}>{favCount}</span>}
          </Box>
          <Box as="button" onClick={() => (g.guest ? setAccountOpen(true) : setAuthOpen(true))} title={g.guest ? 'Minha conta' : 'Entrar'} style={HBTN} hover="border-color:#15499a; color:#15499a;">
            {g.guest ? <span style={css("font:800 13px/1 'Manrope',sans-serif; color:#15499a;")}>{(g.guest.name[0] || 'H').toUpperCase()}</span> : <Sv d={HICON.user} />}
          </Box>
        </div>
      </div>

      {/* ============ HOME ============ */}
      {screen === 'home' && (
        <div style={css('animation:fadeIn .4s ease both;')}>

          {/* hero */}
          <div style={css(`position:relative; ${m ? 'min-height:auto' : 'height:740px'}; padding:${m ? '104px 20px 36px' : '0 56px 150px'}; display:flex; flex-direction:column; justify-content:${m ? 'flex-start' : 'flex-end'};`)}>
            <div style={css('position:absolute; inset:0; overflow:hidden; z-index:0;')}>
              <div ref={heroRef} style={css(`position:absolute; left:0; right:0; top:-20%; height:140%; background:linear-gradient(180deg, rgba(18,40,70,.28) 0%, rgba(18,40,70,0) 20%, rgba(18,40,70,0) 36%, rgba(18,40,70,.48) 74%, rgba(18,40,70,.68) 100%), url('${settings.hero_image || heroImg}') ${m ? 'center 44%' : 'center 42%'}/cover no-repeat; will-change:transform;`)} />
            </div>
            <div style={css('position:relative; z-index:2; max-width:680px; animation:fadeUp .6s ease both;')}>
              <div style={css(`font:800 ${m ? '34px' : '60px'}/1.06 'Montserrat',sans-serif; color:#fff; letter-spacing:-.02em; text-shadow:0 2px 30px rgba(10,24,45,.35);`)}>{settings.hero_title}</div>
              <div style={css('width:64px; height:3px; background:#d6ad63; border-radius:3px; margin:24px 0 22px;')} />
              <div style={css(`font:400 ${m ? '15px' : '18.5px'}/1.62 'Manrope',sans-serif; color:rgba(255,255,255,.92); max-width:560px; text-shadow:0 1px 16px rgba(10,24,45,.4);`)}>{settings.hero_subtitle}</div>
            </div>

            {/* search card — destaque: borda dourada + sombra forte + cantos suaves */}
            <div style={css(`${m ? 'position:static; margin-top:26px;' : 'position:absolute; left:56px; right:56px; bottom:-44px;'} z-index:5; background:#ffffff; border-radius:18px; box-shadow:0 34px 70px -18px rgba(12,28,52,.55); padding:14px; display:flex; flex-direction:${m ? 'column' : 'row'}; align-items:stretch; gap:${m ? '2px' : '0'}; border:2px solid #c9a84c;`)}>
              <div style={css('flex:1.5; padding:12px 22px; display:flex; flex-direction:column; justify-content:center;')}>
                <div style={css("font:700 10.5px/1 'Montserrat',sans-serif; letter-spacing:.1em; text-transform:uppercase; color:#a8842c; margin-bottom:8px;")}>Onde</div>
                <select value={hood} onChange={(e) => A.setHood(e.target.value as 'all' | 'ipanema' | 'leblon')} style={css("border:none; outline:none; background:transparent; font:600 16px/1.1 'Manrope',sans-serif; color:#1c3a5f; cursor:pointer; width:100%;")}>
                  <option value="all">Todos os bairros</option>
                  <option value="ipanema">Ipanema</option>
                  <option value="leblon">Leblon</option>
                </select>
              </div>
              <div style={css(`width:1px; background:#e7eef5; margin:8px 0; display:${m ? 'none' : 'block'};`)} />
              <DateRangeField checkin={checkin} checkout={checkout} onSelect={(ci, co) => { A.setCheckin(ci); A.setCheckout(co); }} mobile={m} minAdvanceDays={Number(settings.min_advance_days) || 1} />
              <div style={css(`width:1px; background:#e7eef5; margin:8px 0; display:${m ? 'none' : 'block'};`)} />
              <div style={css('flex:1; padding:12px 22px; display:flex; flex-direction:column; justify-content:center;')}>
                <div style={css("font:700 10.5px/1 'Montserrat',sans-serif; letter-spacing:.1em; text-transform:uppercase; color:#a8842c; margin-bottom:8px;")}>Hóspedes</div>
                <div style={css('display:flex; align-items:center; gap:14px;')}>
                  <Box as="span" onClick={gMinus} style="width:26px; height:26px; border-radius:50%; border:1.5px solid #d4e0ec; display:flex; align-items:center; justify-content:center; font:700 16px/1 'Manrope',sans-serif; color:#15499a; cursor:pointer; user-select:none;" hover="border-color:#15499a;">−</Box>
                  <span style={css("font:600 16px/1 'Manrope',sans-serif; color:#1c3a5f; min-width:18px; text-align:center;")}>{guests}</span>
                  <Box as="span" onClick={gPlus} style="width:26px; height:26px; border-radius:50%; border:1.5px solid #d4e0ec; display:flex; align-items:center; justify-content:center; font:700 16px/1 'Manrope',sans-serif; color:#15499a; cursor:pointer; user-select:none;" hover="border-color:#15499a;">+</Box>
                </div>
              </div>
              <div style={css(`display:flex; align-items:center; padding-left:${m ? '0' : '8px'}; ${m ? 'padding-top:6px;' : ''}`)}>
                <Box onClick={doSearch} style={`font:700 15px/1 'Manrope',sans-serif; color:#fff; background:#15499a; border-radius:11px; padding:${m ? '16px 40px' : '20px 40px'}; display:flex; align-items:center; justify-content:center; cursor:pointer; ${m ? 'width:100%;' : ''}`} hover="background:#0f3a82;">Buscar</Box>
              </div>
            </div>
          </div>

          {/* trust strip */}
          <div style={css(`display:flex; align-items:center; justify-content:center; gap:${m ? '14px 20px' : '44px'}; padding:${m ? '30px 20px 18px' : '78px 48px 26px'}; background:#fff; flex-wrap:wrap;`)}>
            <div style={css('display:flex; align-items:center; gap:10px;')}><span style={css("font:800 26px/1 'Montserrat',sans-serif; color:#15499a;")}>{settings.stat_rating}</span><span style={css("font:500 13px/1.3 'Manrope',sans-serif; color:#5a6b80;")}><span style={css('color:#d6ad63;')}>★★★★★</span><br />{settings.stat_reviews} avaliações</span></div>
            <div style={css('width:1px; height:34px; background:#e2ebf4;')} />
            <span style={css("font:600 14px/1 'Manrope',sans-serif; color:#1c3a5f;")}>Recepção 24h</span>
            <div style={css('width:1px; height:34px; background:#e2ebf4;')} />
            <span style={css("font:600 14px/1 'Manrope',sans-serif; color:#1c3a5f;")}>Reserva em 2 minutos</span>
            <div style={css('width:1px; height:34px; background:#e2ebf4;')} />
            <span style={css("font:600 14px/1 'Manrope',sans-serif; color:#1c3a5f;")}>Cancelamento flexível</span>
            <div style={css('width:1px; height:34px; background:#e2ebf4;')} />
            <span style={css("font:600 14px/1 'Manrope',sans-serif; color:#1c3a5f;")}>Pagamento seguro</span>
          </div>

          {/* neighborhoods */}
          <div style={css(`padding:${m ? '34px 20px 44px' : '50px 56px 60px'}; background:#fff;`)}>
            <div style={css('text-align:center; max-width:640px; margin:0 auto 40px;')}>
              <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#15499a; margin-bottom:14px;")}>Onde a MC Flats atua</div>
              <div style={css(`font:800 ${m ? '25px' : '38px'}/1.12 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em;`)}>Dois endereços, a mesma Zona Sul nobre</div>
            </div>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : '1fr 1fr'}; gap:${m ? '18px' : '26px'};`)}>
              <Box onClick={goIpanema} style={`position:relative; border-radius:18px; overflow:hidden; height:${m ? '300px' : '440px'}; box-shadow:0 24px 50px -26px rgba(28,58,95,.4); cursor:pointer; transition:transform .3s ease;`} hover="transform:translateY(-5px);">
                <div style={css(`position:absolute; inset:0; background:linear-gradient(180deg, rgba(18,40,70,.05) 0%, rgba(18,40,70,.1) 42%, rgba(18,40,70,.8) 100%), url('${settings.image_ipanema || ipanemaImg}') center/cover no-repeat;`)} />
                <div style={css("position:absolute; top:20px; left:20px; font:700 11px/1 'Manrope',sans-serif; color:#15499a; background:rgba(255,255,255,.94); border-radius:100px; padding:9px 15px;")}>{site.apts.filter((a) => a.hood === 'ipanema').length} apartamentos</div>
                <div style={css('position:absolute; left:30px; right:30px; bottom:30px;')}>
                  <div style={css("font:800 32px/1 'Montserrat',sans-serif; color:#fff; letter-spacing:-.01em; margin-bottom:10px;")}>Ipanema</div>
                  <div style={css("font:400 14.5px/1.6 'Manrope',sans-serif; color:rgba(255,255,255,.9); max-width:380px; margin-bottom:18px;")}>Próximos à praia, ao metrô, restaurantes e aos principais pontos da Zona Sul.</div>
                  <span style={css("display:inline-flex; align-items:center; gap:8px; font:700 13.5px/1 'Manrope',sans-serif; color:#1c3a5f; background:#fff; border-radius:9px; padding:13px 20px;")}>Ver apartamentos <span style={css('color:#d6ad63;')}>→</span></span>
                </div>
              </Box>
              <Box onClick={goLeblon} style={`position:relative; border-radius:18px; overflow:hidden; height:${m ? '300px' : '440px'}; box-shadow:0 24px 50px -26px rgba(28,58,95,.4); cursor:pointer; transition:transform .3s ease;`} hover="transform:translateY(-5px);">
                <div style={css(`position:absolute; inset:0; background:linear-gradient(180deg, rgba(18,40,70,.05) 0%, rgba(18,40,70,.1) 42%, rgba(18,40,70,.8) 100%), url('${settings.image_leblon || leblonImg}') center/cover no-repeat;`)} />
                <div style={css("position:absolute; top:20px; left:20px; font:700 11px/1 'Manrope',sans-serif; color:#15499a; background:rgba(255,255,255,.94); border-radius:100px; padding:9px 15px;")}>{site.apts.filter((a) => a.hood === 'leblon').length} apartamentos</div>
                <div style={css('position:absolute; left:30px; right:30px; bottom:30px;')}>
                  <div style={css("font:800 32px/1 'Montserrat',sans-serif; color:#fff; letter-spacing:-.01em; margin-bottom:10px;")}>Leblon</div>
                  <div style={css("font:400 14.5px/1.6 'Manrope',sans-serif; color:rgba(255,255,255,.9); max-width:380px; margin-bottom:18px;")}>Localização nobre, conforto e a tranquilidade do bairro mais sofisticado do Rio.</div>
                  <span style={css("display:inline-flex; align-items:center; gap:8px; font:700 13.5px/1 'Manrope',sans-serif; color:#1c3a5f; background:#fff; border-radius:9px; padding:13px 20px;")}>Ver apartamentos <span style={css('color:#d6ad63;')}>→</span></span>
                </div>
              </Box>
            </div>
          </div>

          {/* featured */}
          <div style={css(`padding:${m ? '16px 20px 44px' : '24px 56px 64px'}; background:#fff;`)}>
            <div style={css(`display:flex; align-items:${m ? 'flex-start' : 'flex-end'}; flex-direction:${m ? 'column' : 'row'}; gap:${m ? '8px' : '0'}; justify-content:space-between; margin-bottom:${m ? '22px' : '30px'};`)}>
              <div>
                <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#15499a; margin-bottom:12px;")}>Seleção MC Flats</div>
                <div style={css(`font:800 ${m ? '24px' : '34px'}/1 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.01em;`)}>Apartamentos em destaque</div>
              </div>
              <Box as="span" onClick={goResults} style="font:700 13.5px/1 'Manrope',sans-serif; color:#15499a; cursor:pointer;" hover="color:#0f3a82;">Ver todos os {site.apts.length} →</Box>
            </div>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : 'repeat(4,1fr)'}; gap:${m ? '18px' : '24px'};`)}>
              {feat.map((c) => <AptCard key={c.id} m={c} variant="feat" />)}
            </div>
          </div>

          {/* tradition band */}
          <div id="sobre" style={css(`padding:${m ? '40px 20px' : '64px 56px'}; background:#f7f3ec; scroll-margin-top:70px; display:grid; grid-template-columns:${m ? '1fr' : '.82fr 1.18fr'}; gap:${m ? '32px' : '56px'}; align-items:center;`)}>
            <div>
              <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#b88a3e; margin-bottom:16px;")}>Tradição carioca</div>
              <div style={css(`font:800 ${m ? '25px' : '34px'}/1.16 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em; margin-bottom:18px;`)}>Mais de 30 anos no mercado imobiliário do Rio</div>
              <div style={css("font:400 15.5px/1.7 'Manrope',sans-serif; color:#5a6b80; margin-bottom:26px; max-width:420px;")}>{settings.institutional_about}</div>
              <div style={css(`display:flex; gap:${m ? '20px' : '32px'};`)}>
                <div><div style={css("font:800 38px/1 'Montserrat',sans-serif; color:#15499a;")}>{settings.stat_years}</div><div style={css("font:600 12px/1.3 'Manrope',sans-serif; color:#5a6b80; margin-top:6px;")}>anos de<br />experiência</div></div>
                <div style={css('width:1px; background:#e4dccd;')} />
                <div><div style={css("font:800 38px/1 'Montserrat',sans-serif; color:#15499a;")}>{site.apts.length}</div><div style={css("font:600 12px/1.3 'Manrope',sans-serif; color:#5a6b80; margin-top:6px;")}>apartamentos<br />na Zona Sul</div></div>
                <div style={css('width:1px; background:#e4dccd;')} />
                <div><div style={css("font:800 38px/1 'Montserrat',sans-serif; color:#15499a;")}>{settings.stat_rating}</div><div style={css("font:600 12px/1.3 'Manrope',sans-serif; color:#5a6b80; margin-top:6px;")}>avaliação<br />dos hóspedes</div></div>
              </div>
            </div>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : '1fr 1fr'}; gap:1px; background:#e4dccd; border:1px solid #e4dccd; border-radius:14px; overflow:hidden;`)}>
              {[
                ['Administração de imóveis', 'Gestão completa da sua unidade, da divulgação ao repasse.'],
                ['Locação por temporada', 'Reservas o ano todo, com ocupação otimizada e suporte 24h.'],
                ['Atendimento personalizado', 'Relação próxima com hóspedes e proprietários, de pessoa para pessoa.'],
                ['Apartamentos bem localizados', 'Endereços selecionados a minutos da praia e do melhor da Zona Sul.'],
              ].map(([t, d]) => (
                <div key={t} style={css('background:#f7f3ec; padding:26px 28px;')}><div style={css('width:30px; height:2px; background:#d6ad63; margin-bottom:16px;')} /><div style={css("font:700 16px/1.2 'Manrope',sans-serif; color:#1c3a5f; margin-bottom:8px;")}>{t}</div><div style={css("font:400 13.5px/1.6 'Manrope',sans-serif; color:#5a6b80;")}>{d}</div></div>
              ))}
            </div>
          </div>

          {/* diferenciais */}
          <div style={css(`padding:${m ? '44px 20px' : '78px 56px'}; background:#fff;`)}>
            <div style={css('text-align:center; max-width:640px; margin:0 auto 44px;')}>
              <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#15499a; margin-bottom:14px;")}>{settings.dif_eyebrow}</div>
              <div style={css(`font:800 ${m ? '25px' : '38px'}/1.12 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em;`)}>{settings.dif_title}</div>
            </div>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : 'repeat(3,1fr)'}; gap:${m ? '14px' : '22px'};`)}>
              {diferenciais.map((it, i) => (
                <Box key={it.title + i} style={`display:flex; gap:16px; padding:${m ? '20px' : '26px 24px'}; border:1px solid #e7eef5; border-radius:16px; background:#fff; transition:transform .25s ease, box-shadow .25s ease;`} hover="transform:translateY(-4px); box-shadow:0 22px 44px -24px rgba(28,58,95,.4);">
                  <div style={css('flex:none; width:48px; height:48px; border-radius:12px; background:#eaf2fb; display:flex; align-items:center; justify-content:center;')}><Ic d={ICON[it.icon] || ICON.sparkle} /></div>
                  <div>
                    <div style={css("font:700 16px/1.3 'Manrope',sans-serif; color:#1c3a5f; margin-bottom:6px;")}>{it.title}</div>
                    <div style={css("font:400 13.5px/1.6 'Manrope',sans-serif; color:#5a6b80;")}>{it.desc}</div>
                  </div>
                </Box>
              ))}
            </div>
          </div>

          {/* investir / compra e venda */}
          <div style={css(`position:relative; overflow:hidden; padding:${m ? '48px 20px' : '86px 56px'}; background:linear-gradient(135deg,#12305a,#1c4a86);`)}>
            <div style={css('position:absolute; top:-60px; right:-40px; width:280px; height:280px; border-radius:50%; background:radial-gradient(circle, rgba(214,173,99,.25), rgba(214,173,99,0) 70%);')} />
            <div style={css(`position:relative; z-index:1; display:grid; grid-template-columns:${m ? '1fr' : '1.1fr .9fr'}; gap:${m ? '30px' : '56px'}; align-items:center; max-width:1160px; margin:0 auto;`)}>
              <div>
                <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#e3c074; margin-bottom:16px;")}>{settings.invest_eyebrow}</div>
                <div style={css(`font:800 ${m ? '27px' : '42px'}/1.12 'Montserrat',sans-serif; color:#fff; letter-spacing:-.015em; margin-bottom:18px;`)}>{settings.invest_title}</div>
                <div style={css("font:400 15.5px/1.72 'Manrope',sans-serif; color:rgba(255,255,255,.85); max-width:520px; margin-bottom:28px;")}>{settings.invest_subtitle}</div>
                <Box onClick={waGeneral} style="display:inline-flex; align-items:center; gap:10px; font:700 15px/1 'Manrope',sans-serif; color:#12305a; background:#e3c074; border-radius:11px; padding:16px 28px; cursor:pointer;" hover="background:#d6ad63;">{settings.invest_cta} <span style={css('font:700 15px/1 serif;')}>→</span></Box>
              </div>
              <div style={css(`display:grid; grid-template-columns:1fr 1fr; gap:${m ? '12px' : '16px'};`)}>
                {[['30+', 'anos no mercado carioca'], [String(site.apts.length), 'unidades administradas'], ['4.9', 'avaliação dos hóspedes'], ['24h', 'suporte à operação']].map(([n, l]) => (
                  <div key={l} style={css('background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); border-radius:14px; padding:22px 20px;')}>
                    <div style={css("font:800 32px/1 'Montserrat',sans-serif; color:#e3c074;")}>{n}</div>
                    <div style={css("font:500 12.5px/1.4 'Manrope',sans-serif; color:rgba(255,255,255,.8); margin-top:8px;")}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* depoimentos */}
          <div style={css(`padding:${m ? '46px 20px' : '82px 56px'}; background:#f7f3ec;`)}>
            <div style={css('text-align:center; max-width:640px; margin:0 auto 42px;')}>
              <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#b88a3e; margin-bottom:14px;")}>{settings.depo_eyebrow}</div>
              <div style={css(`font:800 ${m ? '25px' : '38px'}/1.12 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em;`)}>{settings.depo_title}</div>
            </div>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : 'repeat(3,1fr)'}; gap:${m ? '16px' : '24px'};`)}>
              {depoimentos.map((dp, i) => (
                <div key={dp.name + i} style={css('background:#fff; border:1px solid #eadfce; border-radius:16px; padding:28px 26px; display:flex; flex-direction:column;')}>
                  <div style={css('color:#d6ad63; font-size:15px; letter-spacing:2px; margin-bottom:14px;')}>★★★★★</div>
                  <div style={css("font:400 14.5px/1.7 'Manrope',sans-serif; color:#42556b; margin-bottom:20px; flex:1;")}>“{dp.text}”</div>
                  <div style={css('display:flex; align-items:center; gap:12px;')}>
                    <div style={css("flex:none; width:40px; height:40px; border-radius:50%; background:#12305a; color:#e3c074; display:flex; align-items:center; justify-content:center; font:800 14px/1 'Montserrat',sans-serif;")}>{(dp.name || '·')[0]}</div>
                    <div><div style={css("font:700 13.5px/1 'Manrope',sans-serif; color:#1c3a5f;")}>{dp.name}</div><div style={css("font:400 12px/1 'Manrope',sans-serif; color:#9aa9bb; margin-top:4px;")}>{dp.city}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* proprietários */}
          <div id="proprietarios" style={css(`padding:${m ? '44px 20px' : '64px 56px'}; background:#fff; scroll-margin-top:80px;`)}>
            <div style={css(`display:flex; flex-direction:${m ? 'column' : 'row'}; align-items:${m ? 'flex-start' : 'center'}; justify-content:space-between; gap:${m ? '20px' : '40px'}; background:#eaf2fb; border:1px solid #d9e6f5; border-radius:20px; padding:${m ? '30px 24px' : '44px 48px'};`)}>
              <div style={css('max-width:560px;')}>
                <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.2em; text-transform:uppercase; color:#15499a; margin-bottom:12px;")}>Para proprietários</div>
                <div style={css(`font:800 ${m ? '22px' : '30px'}/1.15 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.01em; margin-bottom:12px;`)}>{settings.owner_title}</div>
                <div style={css("font:400 15px/1.7 'Manrope',sans-serif; color:#5a6b80;")}>{settings.owner_text}</div>
              </div>
              <Box onClick={waGeneral} style={`flex:none; font:700 15px/1 'Manrope',sans-serif; color:#fff; background:#15499a; border-radius:11px; padding:17px 30px; cursor:pointer; ${m ? 'width:100%; text-align:center;' : ''}`} hover="background:#0f3a82;">{settings.owner_cta}</Box>
            </div>
          </div>

          {/* FAQ */}
          <div id="faq" style={css(`padding:${m ? '46px 20px' : '82px 56px'}; background:#fff; scroll-margin-top:70px;`)}>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : '.7fr 1.3fr'}; gap:${m ? '24px' : '56px'}; align-items:start; max-width:1160px; margin:0 auto;`)}>
              <div>
                <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#15499a; margin-bottom:14px;")}>Perguntas frequentes</div>
                <div style={css(`font:800 ${m ? '25px' : '34px'}/1.14 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em; margin-bottom:16px;`)}>Tudo o que você precisa saber</div>
                <div style={css("font:400 14.5px/1.7 'Manrope',sans-serif; color:#5a6b80; margin-bottom:20px;")}>Não achou sua resposta? Fale com a nossa equipe pelo WhatsApp.</div>
                <Box onClick={waGeneral} style="display:inline-flex; align-items:center; gap:8px; font:700 14px/1 'Manrope',sans-serif; color:#12305a; background:#fff; border:1.5px solid #3fc35a; border-radius:10px; padding:13px 22px; cursor:pointer;" hover="background:#f1fbf3;"><span style={css('color:#2aa84a; font:700 15px/1 serif;')}>✆</span> Falar no WhatsApp</Box>
              </div>
              <div>
                {faqs.map((fq, i) => <FaqItem key={fq.q + i} q={fq.q} a={fq.a} mobile={m} />)}
              </div>
            </div>
          </div>

          {/* contato + mapa */}
          <div id="contato" style={css(`padding:${m ? '46px 20px' : '82px 56px'}; background:#f2f7fc; scroll-margin-top:70px;`)}>
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : '1fr 1.1fr'}; gap:${m ? '28px' : '52px'}; align-items:center; max-width:1160px; margin:0 auto;`)}>
              <div>
                <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.22em; text-transform:uppercase; color:#15499a; margin-bottom:14px;")}>Fale com a gente</div>
                <div style={css(`font:800 ${m ? '25px' : '36px'}/1.12 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.015em; margin-bottom:24px;`)}>Estamos no coração do Rio, prontos para te receber</div>
                <div style={css('display:flex; flex-direction:column; gap:16px; margin-bottom:28px;')}>
                  {[
                    ['Sede administrativa', 'Av. Presidente Antônio Carlos, 54, Sala 1102, Centro, Rio de Janeiro/RJ'],
                    ['E-mail', settings.contact_email],
                    ['Telefone', settings.contact_phone],
                  ].map(([t, d]) => (
                    <div key={t}><div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px;")}>{t}</div><div style={css("font:500 15px/1.5 'Manrope',sans-serif; color:#1c3a5f;")}>{d}</div></div>
                  ))}
                </div>
                <div style={css('display:flex; align-items:center; gap:12px;')}>
                  <Box onClick={waGeneral} style="display:inline-flex; align-items:center; gap:8px; font:700 14px/1 'Manrope',sans-serif; color:#fff; background:#2aa84a; border-radius:10px; padding:14px 22px; cursor:pointer;" hover="background:#228a3d;"><span style={css('font:700 15px/1 serif;')}>✆</span> WhatsApp</Box>
                  <a href={settings.instagram_url || 'https://instagram.com/mcflatsrio'} target="_blank" rel="noreferrer" style={css('display:flex; align-items:center; justify-content:center; width:46px; height:46px; border-radius:10px; border:1.5px solid #d4e0ec; color:#15499a;')}>IG</a>
                  <a href={settings.facebook_url || 'https://facebook.com/mcflats'} target="_blank" rel="noreferrer" style={css('display:flex; align-items:center; justify-content:center; width:46px; height:46px; border-radius:10px; border:1.5px solid #d4e0ec; color:#15499a;')}>FB</a>
                </div>
              </div>
              <div style={css('border-radius:18px; overflow:hidden; box-shadow:0 24px 50px -26px rgba(28,58,95,.4); border:1px solid #e2ebf4; height:100%; min-height:320px;')}>
                <iframe title="Mapa MC Flats" width="100%" height="100%" style={{ border: 0, display: 'block', minHeight: 340 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Av.+Presidente+Antonio+Carlos+54+Centro+Rio+de+Janeiro&output=embed" />
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ============ RESULTS ============ */}
      {screen === 'results' && (
        <div style={css('animation:fadeIn .4s ease both; background:#f2f7fc; min-height:80vh;')}>
          <div style={css(`padding:${m ? '22px 20px 18px' : '34px 56px 22px'}; background:#fff; border-bottom:1px solid #eef3f8;`)}>
            <div style={css("font:500 13px/1 'Manrope',sans-serif; color:#9aa9bb; margin-bottom:8px;")}>{searchSummary}</div>
            <div style={css(`font:800 ${m ? '24px' : '30px'}/1.1 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.01em; margin-bottom:22px;`)}>{resultsTitle}</div>
            <div style={css('display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;')}>
              <div style={css('display:flex; gap:10px; flex-wrap:wrap;')}>
                <Box as="span" onClick={setHoodAll} style={chip(hood === 'all' && !favView)}>Todos</Box>
                <Box as="span" onClick={setHoodIp} style={chip(hood === 'ipanema' && !favView)}>Ipanema</Box>
                <Box as="span" onClick={setHoodLe} style={chip(hood === 'leblon' && !favView)}>Leblon</Box>
                <Box as="span" onClick={goFavs} style={chip(favView)}>♥ Favoritos</Box>
              </div>
              <div style={css('display:flex; align-items:center; gap:10px;')}>
                <span style={css("font:600 12px/1 'Manrope',sans-serif; color:#9aa9bb;")}>Ordenar</span>
                <select value={sort} onChange={(e) => A.setSort(e.target.value as typeof sort)} style={css("border:1.5px solid #e2ebf4; border-radius:9px; padding:11px 16px; font:600 13px/1 'Manrope',sans-serif; color:#1c3a5f; cursor:pointer; background:#fff;")}>
                  <option value="rel">Relevância</option>
                  <option value="low">Menor preço</option>
                  <option value="high">Maior preço</option>
                  <option value="rate">Melhor avaliação</option>
                </select>
              </div>
            </div>

            {/* filtros por comodidade / quartos / preço */}
            <div style={css('display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:16px; padding-top:16px; border-top:1px solid #eef3f8;')}>
              {AMEN_FILTERS.map(([label, kw]) => (
                <Box key={kw} as="span" onClick={() => A.toggleAmen(kw)} style={fchip(A.amenF.includes(kw))}>{label}</Box>
              ))}
              <select value={A.minBd} onChange={(e) => A.setMinBd(Number(e.target.value))} aria-label="Quartos" style={css("border:1.5px solid #e2ebf4; border-radius:100px; padding:9px 14px; font:600 12.5px/1 'Manrope',sans-serif; color:#42556b; cursor:pointer; background:#fff;")}>
                <option value={0}>Quartos</option>
                <option value={1}>1+ quarto</option>
                <option value={2}>2+ quartos</option>
                <option value={3}>3+ quartos</option>
              </select>
              <select value={A.maxPrice} onChange={(e) => A.setMaxPrice(Number(e.target.value))} aria-label="Preço máximo" style={css("border:1.5px solid #e2ebf4; border-radius:100px; padding:9px 14px; font:600 12.5px/1 'Manrope',sans-serif; color:#42556b; cursor:pointer; background:#fff;")}>
                <option value={0}>Preço</option>
                <option value={600}>até R$ 600</option>
                <option value={800}>até R$ 800</option>
                <option value={1000}>até R$ 1.000</option>
              </select>
              {(A.amenF.length > 0 || A.minBd > 0 || A.maxPrice > 0) && (
                <Box as="span" onClick={A.clearFilters} style="font:600 12.5px/1 'Manrope',sans-serif; color:#c0392b; cursor:pointer; padding:9px 6px;" hover="color:#a5342f;">Limpar filtros</Box>
              )}
            </div>
          </div>

          <div style={css(`padding:${m ? '24px 20px 50px' : '30px 56px 60px'};`)}>
            {list.length === 0 && (
              <div style={css('text-align:center; padding:80px 20px; color:#5a6b80;')}>
                <div style={css("font:800 22px/1 'Montserrat',sans-serif; color:#1c3a5f; margin-bottom:10px;")}>Nenhum apartamento por aqui ainda</div>
                <div style={css("font:400 15px/1.6 'Manrope',sans-serif; margin-bottom:24px;")}>Toque no coração dos apartamentos para salvá-los como favoritos.</div>
                <Box as="span" onClick={setHoodAll} style="font:700 14px/1 'Manrope',sans-serif; color:#fff; background:#15499a; border-radius:10px; padding:14px 26px; cursor:pointer;">Ver todos os apartamentos</Box>
              </div>
            )}
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : 'repeat(3,1fr)'}; gap:${m ? '18px' : '26px'};`)}>
              {list.map((c) => <AptCard key={c.id} m={c} variant="list" />)}
            </div>
          </div>
        </div>
      )}

      {/* ============ DETAIL ============ */}
      {screen === 'detail' && detail && (
        <div style={css('animation:fadeIn .4s ease both; background:#fff;')}>
          <div style={css(`padding:${m ? '20px 20px 50px' : '24px 56px 60px'};`)}>
            <Box onClick={A.goBack} style="display:inline-flex; align-items:center; gap:8px; font:600 13px/1 'Manrope',sans-serif; color:#5a6b80; cursor:pointer; margin-bottom:18px;" hover="color:#15499a;">‹ Voltar para a busca</Box>

            <div style={css(`display:flex; align-items:${m ? 'flex-start' : 'flex-end'}; flex-direction:${m ? 'column' : 'row'}; justify-content:space-between; margin-bottom:20px; gap:${m ? '14px' : '20px'};`)}>
              <div>
                <div style={css(`font:800 ${m ? '24px' : '32px'}/1.1 'Montserrat',sans-serif; color:#1c3a5f; letter-spacing:-.01em; margin-bottom:8px;`)}>{detail.name}</div>
                <div style={css("font:500 13.5px/1 'Manrope',sans-serif; color:#42556b;")}>{detail.reviews > 0 && <><span style={css('font-weight:700; color:#1c3a5f;')}><span style={css('color:#d6ad63;')}>★</span> {detail.ratingFmt}</span> · {detail.reviews} avaliações · </>}<span style={css('text-transform:capitalize;')}>{detail.hood}</span>, Rio de Janeiro</div>
              </div>
              <div style={css('display:flex; gap:14px;')}>
                <Box as="span" onClick={detail.toggleFav} style="display:inline-flex; align-items:center; gap:8px; font:600 13px/1 'Manrope',sans-serif; color:#1c3a5f; border:1.5px solid #e2ebf4; border-radius:9px; padding:12px 18px; cursor:pointer;" hover="border-color:#15499a;"><span style={css(`color:${detail.heart}; font-size:15px;`)}>{detail.heartIcon}</span> Salvar</Box>
              </div>
            </div>

            {/* gallery — foto grande (azul) + miniaturas na lateral direita (verde) no desktop; embaixo no mobile */}
            <div style={css(`margin-bottom:${m ? '22px' : '30px'}; ${m ? '' : 'display:grid; grid-template-columns:1fr 120px; gap:12px; height:560px;'}`)}>
              <Box onClick={() => setLbOpen(true)} aria-label="Ampliar fotos" style={`position:relative; border-radius:16px; overflow:hidden; cursor:zoom-in; height:${m ? '300px' : '100%'};`}>
                <img src={detail.gImg} alt={detail.name} style={css('width:100%; height:100%; object-fit:cover; object-position:50% 42%; display:block; animation:fadeIn .3s ease;')} />
                <span style={css("position:absolute; bottom:16px; left:16px; display:inline-flex; align-items:center; gap:7px; font:700 12.5px/1 'Manrope',sans-serif; color:#1c3a5f; background:rgba(255,255,255,.94); border-radius:100px; padding:10px 16px;")}>⤢ Ver todas as {act ? act.imgs.length : detail.thumbs.length} fotos</span>
                <span style={css("position:absolute; bottom:16px; right:16px; font:600 11.5px/1 'Manrope',sans-serif; color:#fff; background:rgba(18,40,70,.7); border-radius:100px; padding:7px 14px;")}>{detail.galleryPos}</span>
              </Box>
              <div style={css(`display:flex; gap:10px; scrollbar-width:thin; ${m ? 'margin-top:10px; overflow-x:auto; padding-bottom:4px;' : 'flex-direction:column; height:560px; overflow-y:auto; padding-right:2px;'}`)}>
                {detail.thumbs.map((t) => (
                  <Box key={t.i} onClick={t.pick} aria-label={`Ver foto ${t.i + 1}`} style={`flex:0 0 auto; ${m ? 'width:76px; height:58px;' : 'width:100%; height:84px;'} border-radius:10px; overflow:hidden; cursor:pointer; border:${t.border};`}>
                    <img src={t.url} alt={`${detail.name} — foto ${t.i + 1}`} loading="lazy" style={css('width:100%; height:100%; object-fit:cover; display:block;')} />
                  </Box>
                ))}
              </div>
            </div>
            {lbOpen && act && <Lightbox images={act.imgs.map(imgU)} index={gi} onClose={() => setLbOpen(false)} onIndex={A.setGi} />}

            {/* two columns */}
            <div style={css(`display:grid; grid-template-columns:${m ? '1fr' : '1fr 380px'}; gap:${m ? '30px' : '48px'}; align-items:start;`)}>
              <div>
                <div style={css("display:flex; gap:26px; padding-bottom:24px; border-bottom:1px solid #eef3f8; margin-bottom:24px; font:500 14px/1 'Manrope',sans-serif; color:#42556b; flex-wrap:wrap;")}>
                  <span><strong style={css('color:#1c3a5f;')}>{detail.bdLabel}</strong></span>
                  <span><strong style={css('color:#1c3a5f;')}>{detail.ba}</strong> banheiro{detail.baS}</span>
                  <span><strong style={css('color:#1c3a5f;')}>{detail.guests}</strong> hóspedes</span>
                  <span><strong style={css('color:#1c3a5f;')}>Vaga</strong> privativa</span>
                </div>
                <div style={css("font:800 20px/1.1 'Montserrat',sans-serif; color:#1c3a5f; margin-bottom:12px;")}>Sobre o espaço</div>
                <div style={css("font:400 15px/1.7 'Manrope',sans-serif; color:#42556b; margin-bottom:30px; max-width:580px;")}>{detail.desc}</div>
                <div style={css("font:800 20px/1.1 'Montserrat',sans-serif; color:#1c3a5f; margin-bottom:16px;")}>O que o apartamento oferece</div>
                <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:13px 24px; font:500 14px/1.3 'Manrope',sans-serif; color:#42556b; margin-bottom:30px;")}>
                  {detail.amenities.map((am) => (
                    <span key={am} style={css('display:flex; align-items:center; gap:10px;')}><span style={css('color:#15499a; font-weight:700;')}>·</span> {am}</span>
                  ))}
                </div>
                <div style={css('border-radius:14px; overflow:hidden; height:240px; position:relative; background:linear-gradient(135deg,#dfeaf4,#eef4fa); border:1px solid #e2ebf4;')}>
                  {detail.lat && detail.lng ? (
                    <iframe
                      title="Localização do imóvel"
                      src={`https://maps.google.com/maps?q=${detail.lat},${detail.lng}&z=16&hl=pt-BR&output=embed`}
                      style={css('width:100%; height:100%; border:0; display:block;')}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <>
                      <img src={detail.mapImg} alt="mapa" style={css('width:100%; height:100%; object-fit:cover; display:block; opacity:.92;')} />
                      <div style={css('position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:40px; height:40px; border-radius:50% 50% 50% 0; background:#15499a; rotate:-45deg; box-shadow:0 8px 20px -6px rgba(21,73,154,.7);')} />
                    </>
                  )}
                  <div style={css("position:absolute; left:16px; bottom:16px; font:600 12px/1 'Manrope',sans-serif; color:#1c3a5f; background:rgba(255,255,255,.94); border-radius:8px; padding:10px 14px; text-transform:capitalize; pointer-events:none; box-shadow:0 4px 12px -4px rgba(10,24,45,.3);")}>{detail.hood}, Zona Sul · Rio de Janeiro</div>
                </div>

              </div>

              {/* booking card */}
              <div ref={bookingRef} style={css(`position:${m ? 'static' : 'sticky'}; top:90px; background:#fff; border:1px solid #e2ebf4; border-radius:16px; box-shadow:0 18px 50px -20px rgba(28,58,95,.34); padding:24px;`)}>
                <div style={css('display:flex; align-items:baseline; gap:6px; margin-bottom:18px;')}><span style={css("font:800 26px/1 'Montserrat',sans-serif; color:#1c3a5f;")}>{detail.priceFmt}</span>{detail.hasPrice && <span style={css("font:400 14px/1 'Manrope',sans-serif; color:#9aa9bb;")}>/noite</span>}</div>
                <div style={css('border:1px solid #e2ebf4; border-radius:12px; overflow:hidden; margin-bottom:12px;')}>
                  <div style={css('display:flex;')}>
                    <div style={css('flex:1; padding:11px 14px; border-right:1px solid #e2ebf4;')}><div style={css("font:700 9.5px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px;")}>Check-in</div><div style={css("font:600 13px/1 'Manrope',sans-serif; color:#1c3a5f;")}>{fmtDate(checkin)}</div></div>
                    <div style={css('flex:1; padding:11px 14px;')}><div style={css("font:700 9.5px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px;")}>Check-out</div><div style={css("font:600 13px/1 'Manrope',sans-serif; color:#1c3a5f;")}>{fmtDate(checkout)}</div></div>
                  </div>
                  <div style={css('padding:11px 14px; border-top:1px solid #e2ebf4; display:flex; align-items:center; justify-content:space-between;')}>
                    <div><div style={css("font:700 9.5px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px;")}>Hóspedes</div><div style={css("font:600 13px/1 'Manrope',sans-serif; color:#1c3a5f;")}>{guests} pessoas</div></div>
                    <div style={css('display:flex; align-items:center; gap:12px;')}>
                      <Box as="span" onClick={gMinus} aria-label="Menos hóspedes" style="width:26px; height:26px; border-radius:50%; border:1.5px solid #d4e0ec; display:flex; align-items:center; justify-content:center; font:700 16px/1 'Manrope',sans-serif; color:#15499a; cursor:pointer; user-select:none;">−</Box>
                      <Box as="span" onClick={gPlus} aria-label="Mais hóspedes" style="width:26px; height:26px; border-radius:50%; border:1.5px solid #d4e0ec; display:flex; align-items:center; justify-content:center; font:700 16px/1 'Manrope',sans-serif; color:#15499a; cursor:pointer; user-select:none;">+</Box>
                    </div>
                  </div>
                </div>
                <div style={css('margin-bottom:14px;')}>
                  <PriceCalendar
                    price={detail.priceNum}
                    occupied={avail}
                    minNights={detail.minNights}
                    minAdvanceDays={Number(settings.min_advance_days) || 1}
                    checkin={checkin}
                    checkout={checkout}
                    onSelect={(ci, co) => { A.setCheckin(ci); A.setCheckout(co); }}
                  />
                </div>
                <Box onClick={() => { if (!g.guest) { setAuthOpen(true); return; } A.setForm({ ...form, nome: form.nome || g.guest.name || '', email: form.email || g.guest.email || '', tel: form.tel || g.guest.phone || '' }); setPayMethod(''); setDocFile(null); setDocConsent(false); detail.reserve(); }} style="background:#15499a; border-radius:12px; padding:16px; text-align:center; font:700 15px/1 'Manrope',sans-serif; color:#fff; margin-bottom:10px; cursor:pointer;" hover="background:#0f3a82;">Reservar agora</Box>
                {!g.guest && <div style={css("text-align:center; font:500 11.5px/1.4 'Manrope',sans-serif; color:#9aa9bb; margin-bottom:10px;")}>Você precisa entrar para reservar.</div>}
                <Box onClick={detail.whats} style="display:flex; align-items:center; justify-content:center; gap:8px; background:#fff; border:1.5px solid #3fc35a; border-radius:12px; padding:14px; font:700 14px/1 'Manrope',sans-serif; color:#1c3a5f; margin-bottom:16px; cursor:pointer;" hover="background:#f1fbf3;"><span style={css('color:#2aa84a; font:700 15px/1 serif;')}>✆</span> Reservar pelo WhatsApp</Box>
                <div style={css("text-align:center; font:400 12px/1.4 'Manrope',sans-serif; color:#9aa9bb; margin-bottom:18px;")}>Você ainda não será cobrado</div>
                {detail.hasPrice && (
                  <div style={css("font:400 13.5px/1 'Manrope',sans-serif; color:#42556b;")}>
                    <div style={css('display:flex; justify-content:space-between; margin-bottom:10px;')}><span>{detail.perNightLine}</span><span>{detail.subFmt}</span></div>
                    <div style={css('display:flex; justify-content:space-between; padding-top:12px; border-top:1px solid #eef3f8; font-weight:700; color:#1c3a5f; font-size:15px;')}><span>Total</span><span>{detail.totalFmt}</span></div>
                  </div>
                )}
                {detail.minNights > 1 && <div style={css("margin-top:10px; text-align:center; font:500 12px/1.4 'Manrope',sans-serif; color:#9aa9bb;")}>Estadia mínima: {detail.minNights} noites</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ FOOTER ============ */}
      <div style={css(`background:#12305a; padding:${m ? '40px 20px 24px' : '50px 56px 28px'}; color:#fff;`)}>
        <div style={css(`display:grid; grid-template-columns:${m ? '1fr 1fr' : '1.4fr 1fr 1fr 1.2fr'}; gap:${m ? '28px 20px' : '40px'}; padding-bottom:38px; border-bottom:1px solid rgba(255,255,255,.14);`)}>
          <div>
            <img src={logoFooter} alt="mcflats" style={css('height:88px; width:auto; margin-bottom:18px;')} />
            <div style={css("font:400 13.5px/1.7 'Manrope',sans-serif; color:rgba(255,255,255,.62); max-width:280px;")}>Vendas e aluguéis de temporada em Leblon e Ipanema. Conforto de casa com serviço de hotel, há mais de 30 anos.</div>
          </div>
          <div>
            <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#ffffff; margin-bottom:16px;")}>Apartamentos</div>
            <div style={css("font:400 13.5px/2.2 'Manrope',sans-serif; color:rgba(255,255,255,.72);")}><Box as="span" onClick={goIpanema} style="cursor:pointer;" hover="color:#fff;">Ipanema</Box><br /><Box as="span" onClick={goLeblon} style="cursor:pointer;" hover="color:#fff;">Leblon</Box><br /><Box as="span" onClick={goResults} style="cursor:pointer;" hover="color:#fff;">Ver todos</Box><br /><Box as="span" onClick={goFavs} style="cursor:pointer;" hover="color:#fff;">Favoritos</Box></div>
          </div>
          <div>
            <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#ffffff; margin-bottom:16px;")}>Institucional</div>
            <div style={css("font:400 13.5px/2.2 'Manrope',sans-serif; color:rgba(255,255,255,.72);")}><Box as="span" onClick={() => goSection('sobre')} style="cursor:pointer;" hover="color:#fff;">Quem somos</Box><br /><Box as="span" onClick={() => goSection('proprietarios')} style="cursor:pointer;" hover="color:#fff;">Administração de imóveis</Box><br /><Box as="span" onClick={waGeneral} style="cursor:pointer;" hover="color:#fff;">Reservas corporativas</Box><br /><Box as="span" onClick={() => goSection('faq')} style="cursor:pointer;" hover="color:#fff;">FAQ</Box></div>
          </div>
          <div>
            <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#ffffff; margin-bottom:16px;")}>Contato</div>
            <div style={css("font:400 13.5px/2 'Manrope',sans-serif; color:rgba(255,255,255,.72);")}>{settings.contact_email}<br />{settings.contact_phone}</div>
            <Box as="span" onClick={waGeneral} style="display:inline-block; margin-top:14px; font:700 12.5px/1 'Manrope',sans-serif; color:#12305a; background:#3fc35a; border-radius:8px; padding:11px 16px; cursor:pointer;" hover="background:#36b04e;">WhatsApp</Box>
          </div>
        </div>
        <div style={css(`display:flex; align-items:center; justify-content:space-between; flex-direction:${m ? 'column' : 'row'}; gap:${m ? '8px' : '0'}; padding-top:22px; font:400 12px/1 'Manrope',sans-serif; color:rgba(255,255,255,.5);`)}>
          <span>© 2026 MC Flats · CNPJ 68.688.837/0001-09 · <Box as="span" onClick={() => setPrivacyOpen(true)} style="cursor:pointer; text-decoration:underline;" hover="color:#fff;">Política de Privacidade</Box></span>
          <span style={css('display:flex; gap:16px;')}>
            <a href={settings.instagram_url || 'https://instagram.com/mcflatsrio'} target="_blank" rel="noreferrer" style={css('color:rgba(255,255,255,.7);')}>Instagram</a>
            <a href={settings.facebook_url || 'https://facebook.com/mcflats'} target="_blank" rel="noreferrer" style={css('color:rgba(255,255,255,.7);')}>Facebook</a>
          </span>
        </div>
      </div>

      {/* ============ BOOKING MODAL ============ */}
      {booking && detail && (
        <div style={css('position:fixed; inset:0; z-index:90; background:rgba(15,26,43,.55); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; animation:fadeIn .25s ease both;')}>
          <div style={css('width:520px; max-width:100%; max-height:92vh; overflow:auto; background:#fff; border-radius:20px; box-shadow:0 40px 100px -30px rgba(10,24,45,.6); animation:pop .35s cubic-bezier(.2,.8,.2,1) both;')}>

            {bStep === 1 && (
              <div>
                <div style={css('position:relative; height:150px; overflow:hidden; border-radius:20px 20px 0 0;')}>
                  <img src={detail.gImg} alt="" style={css('width:100%; height:100%; object-fit:cover; display:block;')} />
                  <div style={css('position:absolute; inset:0; background:linear-gradient(180deg,rgba(18,40,70,.1),rgba(18,40,70,.7));')} />
                  <Box as="span" onClick={() => A.setBooking(false)} aria-label="Fechar" style="position:absolute; top:14px; right:14px; width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,.92); display:flex; align-items:center; justify-content:center; font:600 17px/1 'Manrope',sans-serif; color:#1c3a5f; cursor:pointer;">✕</Box>
                  <div style={css('position:absolute; left:24px; bottom:16px;')}><div style={css("font:800 20px/1.1 'Montserrat',sans-serif; color:#fff;")}>{detail.name}</div><div style={css("font:500 12.5px/1 'Manrope',sans-serif; color:rgba(255,255,255,.85); margin-top:4px; text-transform:capitalize;")}>{detail.hood} · {detail.meta}</div></div>
                </div>
                <div style={css('padding:24px 28px 28px;')}>
                  <div style={css("font:800 19px/1.2 'Montserrat',sans-serif; color:#1c3a5f; margin-bottom:18px;")}>Confirme sua reserva</div>
                  <div style={css("background:#f6f9fc; border:1px solid #eef3f8; border-radius:12px; padding:16px 18px; margin-bottom:22px; font:500 13.5px/1 'Manrope',sans-serif; color:#42556b;")}>
                    <div style={css('display:flex; justify-content:space-between; margin-bottom:11px;')}><span>Datas</span><span style={css('font-weight:700; color:#1c3a5f;')}>{fmtDate(checkin)} até {fmtDate(checkout)}</span></div>
                    <div style={css('display:flex; justify-content:space-between; margin-bottom:11px;')}><span>Hóspedes</span><span style={css('font-weight:700; color:#1c3a5f;')}>{guests} pessoas</span></div>
                    <div style={css('display:flex; justify-content:space-between; padding-top:11px; border-top:1px solid #e7eef5;')}><span>Total ({detail.nights} noites)</span><span style={css('font-weight:800; color:#1c3a5f; font-size:15px;')}>{detail.totalFmt}</span></div>
                  </div>

                  <div style={css('display:flex; flex-direction:column; gap:14px; margin-bottom:22px;')}>
                    <div>
                      <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:8px;")}>Nome completo</div>
                      <input value={form.nome} onChange={(e) => A.setForm({ ...form, nome: e.target.value })} placeholder="Seu nome" style={css(`width:100%; border:1.5px solid ${bd('nome')}; border-radius:10px; padding:13px 15px; font:500 14px/1 'Manrope',sans-serif; color:#1c3a5f; outline:none;`)} />
                      {err.nome && <div style={css("font:500 11.5px/1 'Manrope',sans-serif; color:#d9534f; margin-top:6px;")}>{err.nome}</div>}
                    </div>
                    <div style={css(`display:flex; flex-direction:${m ? 'column' : 'row'}; gap:${m ? '14px' : '12px'};`)}>
                      <div style={css('flex:1;')}>
                        <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:8px;")}>E-mail</div>
                        <input value={form.email} onChange={(e) => A.setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" style={css(`width:100%; border:1.5px solid ${bd('email')}; border-radius:10px; padding:13px 15px; font:500 14px/1 'Manrope',sans-serif; color:#1c3a5f; outline:none;`)} />
                        {err.email && <div style={css("font:500 11.5px/1 'Manrope',sans-serif; color:#d9534f; margin-top:6px;")}>{err.email}</div>}
                      </div>
                      <div style={css('flex:1;')}>
                        <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:8px;")}>Telefone</div>
                        <input value={form.tel} onChange={(e) => A.setForm({ ...form, tel: e.target.value })} placeholder="(21) 9...." style={css(`width:100%; border:1.5px solid ${bd('tel')}; border-radius:10px; padding:13px 15px; font:500 14px/1 'Manrope',sans-serif; color:#1c3a5f; outline:none;`)} />
                        {err.tel && <div style={css("font:500 11.5px/1 'Manrope',sans-serif; color:#d9534f; margin-top:6px;")}>{err.tel}</div>}
                      </div>
                    </div>
                    <div>
                      <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:8px;")}>CPF do titular</div>
                      <input value={form.cpf} onChange={(e) => A.setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" inputMode="numeric" style={css(`width:100%; border:1.5px solid ${bd('cpf')}; border-radius:10px; padding:13px 15px; font:500 14px/1 'Manrope',sans-serif; color:#1c3a5f; outline:none;`)} />
                      {err.cpf && <div style={css("font:500 11.5px/1 'Manrope',sans-serif; color:#d9534f; margin-top:6px;")}>{err.cpf}</div>}
                    </div>
                  </div>

                  {bookErr && <div style={css("background:#fbe9e9; color:#c0392b; padding:12px 14px; border-radius:10px; font:600 12.5px/1.5 'Manrope',sans-serif; margin-bottom:16px;")}>{bookErr}</div>}
                  <label style={css("display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; cursor:pointer; font:500 12.5px/1.5 'Manrope',sans-serif; color:#5a6b80;")}>
                    <input type="checkbox" checked={A.consent} onChange={(e) => A.setConsent(e.target.checked)} style={css('margin-top:2px; width:16px; height:16px; accent-color:#15499a; cursor:pointer; flex:none;')} />
                    <span>Li e concordo com o tratamento dos meus dados de contato conforme a <Box as="span" onClick={(e) => { e?.preventDefault(); e?.stopPropagation(); setPrivacyOpen(true); }} style="color:#15499a; font-weight:700; text-decoration:underline; cursor:pointer;">Política de Privacidade</Box>, exclusivamente para atender a esta solicitação de reserva.</span>
                  </label>
                  {err.consent && <div style={css("font:500 11.5px/1 'Manrope',sans-serif; color:#d9534f; margin:-6px 0 14px;")}>{err.consent}</div>}

                  <Box onClick={goToPayment} style="background:#15499a; border-radius:12px; padding:16px; text-align:center; font:700 15px/1 'Manrope',sans-serif; color:#fff; cursor:pointer; margin-bottom:10px;" hover="background:#0f3a82;">Continuar para pagamento</Box>
                  <div onClick={detail.whats} style={css("display:flex; align-items:center; justify-content:center; gap:8px; font:700 13.5px/1 'Manrope',sans-serif; color:#2aa84a; cursor:pointer;")}>ou tire dúvidas pelo WhatsApp ✆</div>
                </div>
              </div>
            )}

            {bStep === 2 && (
              <div>
                <div style={css('display:flex; align-items:center; gap:14px; padding:20px 28px; border-bottom:1px solid #eef3f8;')}>
                  <Box as="span" onClick={() => A.setBStep(1)} aria-label="Voltar" style="width:34px; height:34px; border-radius:50%; background:#f2f7fc; display:flex; align-items:center; justify-content:center; font:700 18px/1 serif; color:#1c3a5f; cursor:pointer;">‹</Box>
                  <div style={css("font:800 19px/1.2 'Montserrat',sans-serif; color:#1c3a5f;")}>Forma de pagamento</div>
                </div>
                <div style={css('padding:22px 28px 28px;')}>
                  <div style={css("font:400 13.5px/1.6 'Manrope',sans-serif; color:#5a6b80; margin-bottom:18px;")}>Escolha como prefere pagar. A confirmação é feita pela nossa equipe no WhatsApp — nada é cobrado automaticamente aqui.</div>

                  <div style={css(`display:flex; gap:12px; margin-bottom:${payMethod ? '20px' : '4px'};`)}>
                    {([['pix', 'Pix', 'Aprovação rápida'], ['cartao', 'Cartão', 'Processado pela equipe']] as const).map(([id, lbl, sub]) => (
                      <Box key={id} onClick={() => { setPayMethod(id); setBookErr(''); }} style={`flex:1; border:2px solid ${payMethod === id ? '#15499a' : '#e2ebf4'}; background:${payMethod === id ? '#f2f7fc' : '#fff'}; border-radius:14px; padding:16px; cursor:pointer; text-align:center;`} hover={payMethod === id ? undefined : 'border-color:#c9d6e6;'}>
                        <div style={css(`font:800 15px/1 'Montserrat',sans-serif; color:${payMethod === id ? '#15499a' : '#1c3a5f'}; margin-bottom:5px;`)}>{lbl}</div>
                        <div style={css("font:500 11.5px/1.3 'Manrope',sans-serif; color:#9aa9bb;")}>{sub}</div>
                      </Box>
                    ))}
                  </div>

                  {payMethod === 'pix' && (
                    <div style={css("background:#f2f7fc; border:1px solid #e2ebf4; border-radius:12px; padding:16px 18px; margin-bottom:20px; font:500 13px/1.6 'Manrope',sans-serif; color:#42556b;")}>
                      Ao continuar, você vai para o WhatsApp com o pedido pronto. A equipe envia a <strong style={css('color:#1c3a5f;')}>chave Pix</strong>, você paga e o financeiro confirma o recebimento. Não é preciso enviar comprovante pelo site.
                    </div>
                  )}

                  {payMethod === 'cartao' && (
                    <div style={css('margin-bottom:20px;')}>
                      <div style={css("background:#f2f7fc; border:1px solid #e2ebf4; border-radius:12px; padding:14px 16px; margin-bottom:16px; font:500 12.5px/1.55 'Manrope',sans-serif; color:#42556b;")}>
                        🔒 Seus dados do cartão são enviados de forma <strong style={css('color:#1c3a5f;')}>criptografada</strong> e só a nossa equipe consegue vê-los para processar o pagamento. A reserva só é confirmada depois da conversa no WhatsApp.
                      </div>
                      <label style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px; display:block;")}>Nome do titular</label>
                      <input value={card.titular} onChange={(e) => cd('titular', e.target.value)} placeholder="Como está no cartão"
                        style={css("width:100%; padding:12px 14px; border:1.5px solid #d4e0ec; border-radius:10px; font:500 14px/1.2 'Manrope',sans-serif; color:#1c3a5f; background:#fff; box-sizing:border-box; margin-bottom:12px;")} />
                      <label style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px; display:block;")}>Número do cartão</label>
                      <input value={card.numero} inputMode="numeric" autoComplete="off"
                        onChange={(e) => cd('numero', e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
                        placeholder="0000 0000 0000 0000"
                        style={css("width:100%; padding:12px 14px; border:1.5px solid #d4e0ec; border-radius:10px; font:500 14px/1.2 'Manrope',sans-serif; color:#1c3a5f; background:#fff; box-sizing:border-box; margin-bottom:12px; letter-spacing:.04em;")} />
                      <div style={css('display:flex; gap:12px; margin-bottom:12px;')}>
                        <div style={css('flex:1;')}>
                          <label style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px; display:block;")}>Validade</label>
                          <input value={card.validade} inputMode="numeric" placeholder="MM/AA"
                            onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); cd('validade', d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d); }}
                            style={css("width:100%; padding:12px 14px; border:1.5px solid #d4e0ec; border-radius:10px; font:500 14px/1.2 'Manrope',sans-serif; color:#1c3a5f; background:#fff; box-sizing:border-box;")} />
                        </div>
                        <div style={css('flex:1;')}>
                          <label style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#9aa9bb; margin-bottom:6px; display:block;")}>CVV</label>
                          <input value={card.cvv} inputMode="numeric" placeholder="000" autoComplete="off"
                            onChange={(e) => cd('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
                            style={css("width:100%; padding:12px 14px; border:1.5px solid #d4e0ec; border-radius:10px; font:500 14px/1.2 'Manrope',sans-serif; color:#1c3a5f; background:#fff; box-sizing:border-box;")} />
                        </div>
                      </div>
                      <div style={css("font:700 11px/1 'Montserrat',sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#9aa9bb; margin-bottom:8px;")}>Documento do titular (RG ou CNH)</div>
                      <label style={css(`display:flex; align-items:center; gap:12px; border:1.5px dashed ${docFile ? '#2aa84a' : '#c9d6e6'}; border-radius:12px; padding:14px 16px; cursor:pointer; background:${docFile ? '#f1fbf3' : '#fafcfe'};`)}>
                        <input type="file" accept="image/*" hidden onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          if (f && !f.type.startsWith('image/')) { setBookErr('Envie uma foto (JPG, PNG ou WEBP) do documento.'); setDocFile(null); return; }
                          if (f && f.size > 12 * 1024 * 1024) { setBookErr('A foto é muito grande (máx. 12 MB). Tente outra ou reduza a resolução.'); setDocFile(null); return; }
                          setBookErr(''); setDocFile(f);
                        }} />
                        <span style={css(`font:700 20px/1 serif; color:${docFile ? '#2aa84a' : '#9aa9bb'};`)}>{docFile ? '✓' : '⬆'}</span>
                        <span style={css("font:600 13px/1.4 'Manrope',sans-serif; color:#42556b;")}>{docFile ? docFile.name : 'Toque para anexar a foto do documento'}</span>
                      </label>
                      <label style={css("display:flex; align-items:flex-start; gap:9px; margin-top:14px; cursor:pointer; font:500 12px/1.5 'Manrope',sans-serif; color:#5a6b80;")}>
                        <input type="checkbox" checked={docConsent} onChange={(e) => setDocConsent(e.target.checked)} style={css('margin-top:2px; width:15px; height:15px; accent-color:#15499a; cursor:pointer; flex:none;')} />
                        <span>Autorizo o uso da imagem do meu documento para conferência e prevenção de fraude, conforme a <Box as="span" onClick={(e) => { e?.preventDefault(); e?.stopPropagation(); setPrivacyOpen(true); }} style="color:#15499a; font-weight:700; text-decoration:underline; cursor:pointer;">Política de Privacidade</Box>.</span>
                      </label>
                    </div>
                  )}

                  {bookErr && <div style={css("background:#fbe9e9; color:#c0392b; padding:12px 14px; border-radius:10px; font:600 12.5px/1.5 'Manrope',sans-serif; margin-bottom:16px;")}>{bookErr}</div>}

                  <Box onClick={submitting ? undefined : finalize} style={`background:${payMethod ? '#2aa84a' : '#a9c3ae'}; border-radius:12px; padding:16px; text-align:center; font:700 15px/1 'Manrope',sans-serif; color:#fff; cursor:${payMethod && !submitting ? 'pointer' : 'default'}; margin-bottom:10px;`} hover={payMethod && !submitting ? 'background:#228a3d;' : undefined}>{submitting ? 'Enviando…' : 'Finalizar pelo WhatsApp ✆'}</Box>
                  <div onClick={detail.whats} style={css("display:flex; align-items:center; justify-content:center; gap:8px; font:700 13.5px/1 'Manrope',sans-serif; color:#2aa84a; cursor:pointer;")}>ou tire dúvidas pelo WhatsApp ✆</div>
                </div>
              </div>
            )}

            {bStep === 3 && (
              <div style={css('padding:44px 36px 36px; text-align:center;')}>
                <div style={css("width:72px; height:72px; border-radius:50%; background:#e7f6e9; display:flex; align-items:center; justify-content:center; margin:0 auto 22px; font:700 34px/1 serif; color:#2aa84a; animation:pop .4s ease both;")}>✓</div>
                <div style={css("font:800 24px/1.15 'Montserrat',sans-serif; color:#1c3a5f; margin-bottom:12px;")}>Pedido enviado!</div>
                <div style={css("font:400 15px/1.6 'Manrope',sans-serif; color:#5a6b80; max-width:390px; margin:0 auto 22px;")}>Continue a conversa no <strong style={css('color:#1c3a5f;')}>WhatsApp</strong> com a nossa equipe, que confirma a disponibilidade e o pagamento do <strong style={css('color:#1c3a5f;')}>{detail.name}</strong>. Se a janela não abriu, use o botão abaixo.</div>
                <div style={css("display:inline-block; font:700 13px/1 'Manrope',sans-serif; color:#15499a; background:#eaf2fb; border-radius:100px; padding:11px 20px; margin-bottom:28px;")}>Código da reserva · {activeCode}</div>
                <Box onClick={() => { if (act) A.sendLead(act, payMethod || undefined, activeCode); }} style="background:#2aa84a; border-radius:12px; padding:16px; text-align:center; font:700 15px/1 'Manrope',sans-serif; color:#fff; cursor:pointer; margin-bottom:12px;" hover="background:#228a3d;">Reabrir WhatsApp ✆</Box>
                <Box onClick={bkHome} style="font:700 13.5px/1 'Manrope',sans-serif; color:#5a6b80; cursor:pointer;" hover="color:#15499a;">Voltar ao início</Box>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ============ ÁREA DO HÓSPEDE ============ */}
      {authOpen && (
        <AuthModal
          waNumber={settings.contact_whatsapp || WA_NUMBER}
          onClose={() => setAuthOpen(false)}
          onAuthed={(gg) => { g.setGuest(gg); setAuthOpen(false); setAccountOpen(true); }}
          onPrivacy={() => setPrivacyOpen(true)}
        />
      )}
      {accountOpen && g.guest && (
        <AccountModal
          guest={g.guest}
          onClose={() => setAccountOpen(false)}
          onLogout={async () => { await g.logout(); setAccountOpen(false); }}
          onDeleted={() => { g.setGuest(null); setAccountOpen(false); }}
        />
      )}
      {privacyOpen && <PrivacyModal email={settings.contact_email} onClose={() => setPrivacyOpen(false)} />}

      {/* ============ TOAST ============ */}
      {toast && (
        <div style={css("position:fixed; left:50%; bottom:32px; transform:translateX(-50%); z-index:95; background:#1c3a5f; color:#fff; font:600 13.5px/1 'Manrope',sans-serif; padding:14px 24px; border-radius:100px; box-shadow:0 16px 40px -12px rgba(10,24,45,.5); animation:fadeUp .3s ease both; display:flex; align-items:center; gap:10px;")}><span style={css('color:#e3c074;')}>♥</span> {toast}</div>
      )}

      {/* ============ WHATSAPP FLUTUANTE ============ */}
      <Box
        onClick={waGeneral}
        aria-label="Falar no WhatsApp"
        style={`position:fixed; right:${m ? '18px' : '26px'}; bottom:${m ? '20px' : '26px'}; z-index:85; width:${m ? '54px' : '60px'}; height:${m ? '54px' : '60px'}; border-radius:50%; background:#25d366; display:flex; align-items:center; justify-content:center; box-shadow:0 12px 30px -8px rgba(37,211,102,.6); cursor:pointer; transition:transform .2s ease, opacity .2s ease; opacity:${waHidden ? '0' : '1'}; transform:${waHidden ? 'translateY(18px) scale(.85)' : 'none'}; pointer-events:${waHidden ? 'none' : 'auto'};`}
        hover={waHidden ? undefined : 'transform:scale(1.08);'}
      >
        <svg width={m ? 28 : 32} height={m ? 28 : 32} viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.16c-.24.68-1.42 1.3-1.95 1.35-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.87-4.6-4.05-.13-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35.01.5.01.16.01.38-.06.6.46.24.55.8 1.9.87 2.04.07.14.12.3.02.48-.1.18-.15.3-.3.46-.14.18-.3.4-.43.53-.14.14-.29.3-.12.58.17.28.76 1.25 1.63 2.02 1.12 1 2.07 1.31 2.35 1.46.28.14.45.12.6-.07.18-.2.7-.8.88-1.08.18-.28.36-.23.6-.14.24.09 1.55.73 1.82.86.27.14.45.2.5.32.06.11.06.66-.18 1.34z" />
        </svg>
      </Box>

    </div>
  );
}
