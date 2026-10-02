// Métricas de hotelaria (ocupação, ADR, RevPAR) — funções puras, testáveis.
// Datas são strings yyyy-mm-dd. checkout é EXCLUSIVO (nights = checkout - checkin).

const pad = (n) => String(n).padStart(2, '0');
export const addDays = (isoDate, days) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);

// Noites de [checkin, checkout) que caem dentro da janela [from, toExclusive).
export function overlapNights(checkin, checkout, from, toExclusive) {
  const s = checkin > from ? checkin : from;
  const e = checkout < toExclusive ? checkout : toExclusive;
  return e > s ? daysBetween(s, e) : 0;
}

/**
 * Calcula ocupação/ADR/RevPAR de um período [from, to] (ambos inclusivos).
 * @param properties  imóveis publicados: { id, name, hood, price }
 * @param confirmed   reservas CONFIRMADAS: { property_id, checkin, checkout, price }
 * @param funnel      todas as reservas do período (por created_at) p/ o funil: { status }
 */
export function computeReport({ properties, confirmed, from, to, funnel = [] }) {
  const toEx = addDays(to, 1);            // janela meio-aberta [from, toEx)
  const windowNights = Math.max(0, daysBetween(from, toEx));
  const byProp = new Map(
    properties.map((p) => [p.id, { id: p.id, name: p.name, hood: p.hood, availNights: windowNights, occNights: 0, revenue: 0 }]),
  );

  for (const r of confirmed) {
    const p = byProp.get(r.property_id);
    if (!p) continue;                     // imóvel excluído/rascunho: fora do denominador
    const n = overlapNights(r.checkin, r.checkout, from, toEx);
    if (n <= 0) continue;
    p.occNights += n;
    p.revenue += n * (Number(r.price) || 0);
  }

  const rows = [...byProp.values()].map((p) => ({
    ...p,
    occupancy: p.availNights ? p.occNights / p.availNights : 0,
    adr: p.occNights ? Math.round(p.revenue / p.occNights) : 0,     // receita de diárias / noite vendida
    revpar: p.availNights ? Math.round(p.revenue / p.availNights) : 0,
  }));

  const availNights = rows.reduce((s, p) => s + p.availNights, 0);
  const occNights = rows.reduce((s, p) => s + p.occNights, 0);
  const revenue = rows.reduce((s, p) => s + p.revenue, 0);

  const f = { solicitada: 0, confirmada: 0, cancelada: 0 };
  for (const x of funnel) if (x.status in f) f[x.status] += 1;
  const requests = f.solicitada + f.confirmada + f.cancelada;

  return {
    from, to, windowNights,
    totals: {
      properties: rows.length,
      availNights,
      occNights,
      occupancy: availNights ? occNights / availNights : 0,
      revenue,
      adr: occNights ? Math.round(revenue / occNights) : 0,
      revpar: availNights ? Math.round(revenue / availNights) : 0,
    },
    funnel: { ...f, requests, conversion: requests ? f.confirmada / requests : 0 },
    properties: rows.sort((a, b) => b.revenue - a.revenue),
  };
}
