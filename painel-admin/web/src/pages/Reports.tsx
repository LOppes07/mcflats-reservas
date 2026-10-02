import { useEffect, useMemo, useState } from 'react';
import { api, type Report } from '../api';
import { Icon, Spinner, EmptyState } from '../ui';

const money = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR');
const pct = (n: number) => (n * 100).toFixed(1).replace('.', ',') + '%';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Presets calculados no cliente (sem libs de data).
function presets() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = (yy: number, mm: number) => iso(new Date(yy, mm, 1));
  const last = (yy: number, mm: number) => iso(new Date(yy, mm + 1, 0));
  const plus = (days: number) => { const d = new Date(now); d.setDate(d.getDate() + days); return iso(d); };
  return [
    { key: 'mes', label: 'Este mês', from: first(y, m), to: last(y, m) },
    { key: 'mes-1', label: 'Mês passado', from: first(y, m - 1), to: last(y, m - 1) },
    { key: 'prox30', label: 'Próximos 30 dias', from: iso(now), to: plus(30) },
    { key: 'ano', label: 'Este ano', from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}

const HOOD = { ipanema: 'Ipanema', leblon: 'Leblon' } as const;

export default function Reports() {
  const P = useMemo(presets, []);
  const [preset, setPreset] = useState('mes');
  const [from, setFrom] = useState(P[0].from);
  const [to, setTo] = useState(P[0].to);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const pickPreset = (k: string) => {
    const p = P.find((x) => x.key === k);
    if (!p) return;
    setPreset(k); setFrom(p.from); setTo(p.to);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getReport(from, to).then((r) => { if (alive) { setData(r); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const t = data?.totals;
  const cards = t ? [
    { k: 'Ocupação', v: pct(t.occupancy), foot: `${t.occNights} de ${t.availNights} noites`, icon: 'calendar' },
    { k: 'Diária média (ADR)', v: money(t.adr), foot: 'por noite vendida', icon: 'star' },
    { k: 'RevPAR', v: money(t.revpar), foot: 'receita por noite disponível', icon: 'activity' },
    { k: 'Receita de diárias', v: money(t.revenue), foot: `${t.properties} imóveis publicados`, icon: 'building' },
  ] : [];

  const maxRev = data ? Math.max(1, ...data.properties.map((p) => p.revenue)) : 1;

  return (
    <div className="grid" style={{ gap: 22 }}>
      {/* filtros de período */}
      <div className="card card-pad">
        <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {P.map((p) => (
              <button key={p.key} className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => pickPreset(p.key)}>{p.label}</button>
            ))}
          </div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <input type="date" className="input" style={{ width: 'auto' }} value={from} max={to} onChange={(e) => { setPreset(''); setFrom(e.target.value); }} />
            <span className="muted" style={{ fontSize: 13 }}>até</span>
            <input type="date" className="input" style={{ width: 'auto' }} value={to} min={from} onChange={(e) => { setPreset(''); setTo(e.target.value); }} />
          </div>
        </div>
      </div>

      {loading && <Spinner />}

      {!loading && data && (
        <>
          <div className="stats">
            {cards.map((c) => (
              <div className="stat" key={c.k}>
                <div className="chip"><Icon name={c.icon} size={18} /></div>
                <div className="k">{c.k}</div>
                <div className="v">{c.v}</div>
                <div className="foot">{c.foot}</div>
              </div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 22 }}>
            {/* desempenho por imóvel */}
            <div className="card card-pad">
              <div className="section-title" style={{ marginTop: 0 }}>Desempenho por imóvel</div>
              {data.properties.length === 0 ? (
                <EmptyState title="Nenhum imóvel publicado" text="Publique imóveis para ver o desempenho." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className="between muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 0 8px' }}>
                    <span>Imóvel</span>
                    <span style={{ display: 'flex', gap: 18 }}><span style={{ width: 52, textAlign: 'right' }}>Ocup.</span><span style={{ width: 64, textAlign: 'right' }}>ADR</span><span style={{ width: 78, textAlign: 'right' }}>Receita</span></span>
                  </div>
                  {data.properties.map((p) => (
                    <div key={p.id} style={{ padding: '11px 0', borderTop: '1px solid var(--line-2)' }}>
                      <div className="between">
                        <div style={{ minWidth: 0 }}>
                          <div className="strong" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{HOOD[p.hood]} · {p.occNights} noites</div>
                        </div>
                        <span style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ width: 52, textAlign: 'right', color: 'var(--ink)' }}>{pct(p.occupancy)}</span>
                          <span style={{ width: 64, textAlign: 'right' }} className="muted">{money(p.adr)}</span>
                          <span style={{ width: 78, textAlign: 'right' }} className="strong">{money(p.revenue)}</span>
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 100, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 8 }}>
                        <div style={{ width: `${(p.revenue / maxRev) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand), #2f6fd6)', borderRadius: 100 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* funil de pedidos */}
            <div className="card card-pad">
              <div className="section-title" style={{ marginTop: 0 }}>Pedidos no período</div>
              <div style={{ textAlign: 'center', padding: '6px 0 18px' }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{data.funnel.requests}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>solicitações recebidas</div>
              </div>
              <FunnelRow label="Confirmadas" n={data.funnel.confirmada} total={data.funnel.requests} color="var(--ok, #14824a)" />
              <FunnelRow label="Aguardando" n={data.funnel.solicitada} total={data.funnel.requests} color="var(--warn, #b7791f)" />
              <FunnelRow label="Canceladas" n={data.funnel.cancelada} total={data.funnel.requests} color="var(--muted, #6b7a8c)" />
              <div className="between" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
                <span className="strong" style={{ fontSize: 13 }}>Taxa de conversão</span>
                <span className="strong" style={{ fontSize: 16, color: 'var(--brand)' }}>{pct(data.funnel.conversion)}</span>
              </div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
            Ocupação, ADR e RevPAR consideram apenas reservas <b>confirmadas</b> cujas noites caem no período. ADR = receita de diárias ÷ noites vendidas. RevPAR = receita de diárias ÷ noites disponíveis (imóveis publicados × dias). A receita não inclui taxa de limpeza.
          </p>
        </>
      )}
    </div>
  );
}

function FunnelRow({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  const p = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{label}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{n} · {p}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 100, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 100 }} />
      </div>
    </div>
  );
}
