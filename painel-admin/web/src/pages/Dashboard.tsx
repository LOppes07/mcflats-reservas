import { useEffect, useState } from 'react';
import { api, type Stats, type AuditEntry, type Property } from '../api';
import { Icon, Spinner } from '../ui';
import { useAuth, go } from '../App';

const fmtMoney = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR');
const timeAgo = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
};
const ACTION_LABEL: Record<string, string> = {
  create: 'criou', update: 'editou', delete: 'excluiu', login: 'entrou', seed: 'inicializou',
};

export default function Dashboard() {
  const { perms } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [props, setProps] = useState<Property[]>([]);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.listProperties().then(setProps).catch(() => {});
    if (perms.canViewAudit) api.getAudit(8).then(setAudit).catch(() => {});
  }, [perms.canViewAudit]);

  if (!stats) return <Spinner />;

  const noPhotos = props.filter((p) => p.photos.length === 0);
  const drafts = props.filter((p) => p.status === 'draft');

  const cards = [
    { k: 'Imóveis publicados', v: stats.published, foot: `${stats.draft} em rascunho`, icon: 'building' },
    { k: 'Pedidos a confirmar', v: stats.reservationsPending ?? 0, foot: `${stats.guests ?? 0} hóspedes cadastrados`, icon: 'inbox' },
    { k: 'Diária média', v: fmtMoney(stats.avgPrice), foot: 'entre os publicados', icon: 'star' },
    { k: 'Bloqueios ativos', v: stats.blocksUpcoming, foot: 'datas indisponíveis', icon: 'calendar' },
  ];

  return (
    <div className="grid" style={{ gap: 22 }}>
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

      <div className="grid" style={{ gridTemplateColumns: perms.canViewAudit ? '1.4fr 1fr' : '1fr' }}>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>Portfólio por bairro</div>
            <button className="btn btn-ghost btn-sm" onClick={() => go('imoveis')}>Ver imóveis</button>
          </div>
          <HoodBar label="Ipanema" n={stats.byHood.ipanema} total={stats.properties} />
          <HoodBar label="Leblon" n={stats.byHood.leblon} total={stats.properties} />

          {(noPhotos.length > 0 || drafts.length > 0) && (
            <div className="mt-24">
              <div className="section-title">Precisa de atenção</div>
              {noPhotos.length > 0 && (
                <button className="between" onClick={() => go('imoveis')}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--warn-bg)', marginBottom: 8, textAlign: 'left' }}>
                  <span className="flex gap-8" style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 13 }}>
                    <Icon name="upload" size={16} /> {noPhotos.length} imóvel(is) sem foto
                  </span>
                  <Icon name="external" size={14} style={{ color: 'var(--warn)' }} />
                </button>
              )}
              {drafts.length > 0 && (
                <button className="between" onClick={() => go('imoveis')}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', textAlign: 'left' }}>
                  <span className="flex gap-8" style={{ color: 'var(--ink-2)', fontWeight: 700, fontSize: 13 }}>
                    <Icon name="edit" size={16} /> {drafts.length} em rascunho (não aparecem no site)
                  </span>
                  <Icon name="external" size={14} className="muted" />
                </button>
              )}
            </div>
          )}
        </div>

        {perms.canViewAudit && (
          <div className="card card-pad">
            <div className="section-title">Atividade recente</div>
            {audit.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nada por aqui ainda.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {audit.map((a) => (
                <div key={a.id} className="flex gap-12" style={{ padding: '10px 0', borderTop: '1px solid var(--line-2)' }}>
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 11, background: 'var(--brand-100)', color: 'var(--brand)' }}>
                    {a.user_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                      <b>{a.user_name}</b> {ACTION_LABEL[a.action] || a.action} <span className="muted">{a.entity}</span>
                    </div>
                    {a.detail && <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</div>}
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HoodBar({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{label}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{n} imóveis</span>
      </div>
      <div style={{ height: 8, borderRadius: 100, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand), #2f6fd6)', borderRadius: 100 }} />
      </div>
    </div>
  );
}
