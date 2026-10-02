import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Reservation } from '../api';
import { Icon, EmptyState, useToast, useConfirm } from '../ui';
import { useAuth } from '../App';

type CardData = { titular: string; numero: string; validade: string; cvv: string; bandeira: string };

const fmtMoney = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR');
const fmtDate = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const STATUS: Record<string, { label: string; cls: string }> = {
  solicitada: { label: 'Solicitada', cls: 'warn' },
  confirmada: { label: 'Confirmada', cls: 'ok' },
  cancelada: { label: 'Cancelada', cls: 'muted' },
};
const waLink = (phone: string, code: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  const num = digits.length >= 12 ? digits : '55' + digits;
  return `https://wa.me/${num}?text=${encodeURIComponent('Olá! Sobre a sua reserva ' + code + ' na MC Flats...')}`;
};

export default function Reservations() {
  const toast = useToast();
  const confirm = useConfirm();
  const { perms } = useAuth();
  const [list, setList] = useState<Reservation[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [card, setCard] = useState<{ code: string; data: CardData } | null>(null);

  const openCard = async (r: Reservation) => {
    try { const data = await api.getReservationCard(r.id); setCard({ code: r.code, data }); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao abrir cartão', 'err'); }
  };
  const copyCard = (d: CardData) => {
    const txt = `Titular: ${d.titular}\nNúmero: ${d.numero}\nValidade: ${d.validade}\nCVV: ${d.cvv}${d.bandeira ? `\nBandeira: ${d.bandeira}` : ''}`;
    navigator.clipboard?.writeText(txt).then(() => toast('Dados copiados', 'ok'), () => toast('Não foi possível copiar', 'err'));
  };

  const reload = () => api.listReservations().then(setList).catch(() => toast('Erro ao carregar reservas', 'err'));
  useEffect(() => { reload(); }, []);

  const setStatus = async (r: Reservation, status: Reservation['status']) => {
    if (status === 'cancelada') {
      const ok = await confirm({ title: 'Cancelar reserva', message: `Cancelar a reserva ${r.code} de ${r.name}?`, confirmLabel: 'Cancelar reserva', danger: true });
      if (!ok) return;
    }
    try { await api.setReservationStatus(r.id, status); await reload(); toast('Status atualizado', 'ok'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro', 'err'); }
  };

  const filtered = useMemo(() => (list || []).filter((r) => filter === 'all' || r.status === filter), [list, filter]);
  const counts = useMemo(() => {
    const c = { all: (list || []).length, solicitada: 0, confirmada: 0, cancelada: 0 };
    (list || []).forEach((r) => { c[r.status]++; });
    return c;
  }, [list]);

  const chip = (v: string, label: string) => (
    <button key={v} onClick={() => setFilter(v)}
      className={`btn btn-sm ${filter === v ? 'btn-primary' : 'btn-ghost'}`}>{label}</button>
  );

  return (
    <div>
      <div className="flex gap-8" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {chip('all', `Todas (${counts.all})`)}
        {chip('solicitada', `Solicitadas (${counts.solicitada})`)}
        {chip('confirmada', `Confirmadas (${counts.confirmada})`)}
        {chip('cancelada', `Canceladas (${counts.cancelada})`)}
      </div>

      {!list ? <div className="card card-pad"><p className="muted">Carregando…</p></div>
        : filtered.length === 0 ? (
          <div className="card"><EmptyState title="Nenhuma reserva aqui" text="Os pedidos de reserva feitos pelo site aparecem aqui para você confirmar ou cancelar." /></div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead><tr><th>Código</th><th>Hóspede</th><th>Imóvel</th><th>Período</th><th>Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.code}</td>
                    <td>
                      <div className="strong">{r.name || '—'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.email}{r.phone ? ' · ' + r.phone : ''}</div>
                      {r.cpf && <div className="muted" style={{ fontSize: 12 }}>CPF: {r.cpf}</div>}
                    </td>
                    <td>{r.property_name || '—'}</td>
                    <td>{fmtDate(r.checkin)} a {fmtDate(r.checkout)}<div className="muted" style={{ fontSize: 12 }}>{r.nights} noites · {r.guests} hósp.</div></td>
                    <td className="strong">{fmtMoney(r.total)}</td>
                    <td>
                      <span className={`badge ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      {r.payment_method && <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>{r.payment_method === 'pix' ? 'Pix' : 'Cartão'}</div>}
                      {r.doc_file && <a href={`/api/admin/reservations/${r.id}/document`} target="_blank" rel="noreferrer" className="badge brand" style={{ marginTop: 5, textDecoration: 'none' }}>📎 Documento</a>}
                      {r.has_card && perms.canViewAudit && <button className="badge" style={{ marginTop: 5, border: 0, cursor: 'pointer', background: '#eef3ff', color: '#2440a8' }} onClick={() => openCard(r)}>💳 Ver cartão</button>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.phone && <a className="btn btn-ghost btn-sm" href={waLink(r.phone, r.code)} target="_blank" rel="noreferrer" title="WhatsApp">✆</a>}
                      {r.status !== 'confirmada' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setStatus(r, 'confirmada')} title="Confirmar"><Icon name="check" size={14} /></button>}
                      {r.status !== 'cancelada' && <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => setStatus(r, 'cancelada')} title="Cancelar"><Icon name="x" size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {card && (
        <div onClick={() => setCard(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,45,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card card-pad" style={{ maxWidth: 380, width: '100%' }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>Cartão · {card.code}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setCard(null)}><Icon name="x" size={14} /></button>
            </div>
            <pre style={{ background: '#f5f7fb', border: '1px solid #e2ebf4', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, monospace' }}>
{`Titular: ${card.data.titular}
Número: ${card.data.numero}
Validade: ${card.data.validade}
CVV: ${card.data.cvv}${card.data.bandeira ? `\nBandeira: ${card.data.bandeira}` : ''}`}
            </pre>
            <div className="flex gap-8" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => copyCard(card.data)}>Copiar tudo</button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>Estes dados são apagados automaticamente quando a reserva é confirmada ou cancelada.</p>
          </div>
        </div>
      )}
    </div>
  );
}
