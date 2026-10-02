import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Block, type Property } from '../api';
import { Icon, EmptyState, useToast, useConfirm } from '../ui';

const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Blocks() {
  const toast = useToast();
  const confirm = useConfirm();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [props, setProps] = useState<Property[]>([]);
  const [form, setForm] = useState({ property_id: '', start_date: '', end_date: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const reload = () => api.listBlocks().then(setBlocks).catch(() => toast('Erro ao carregar', 'err'));
  useEffect(() => {
    reload();
    api.listProperties().then((p) => { setProps(p); setForm((f) => ({ ...f, property_id: p[0]?.id || '' })); }).catch(() => {});
  }, []);

  const add = async () => {
    if (!form.property_id || !form.start_date || !form.end_date) { toast('Preencha imóvel e datas', 'err'); return; }
    setBusy(true);
    try {
      await api.createBlock(form.property_id, { start_date: form.start_date, end_date: form.end_date, reason: form.reason });
      toast('Período bloqueado', 'ok');
      setForm((f) => ({ ...f, start_date: '', end_date: '', reason: '' }));
      reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao bloquear', 'err'); }
    finally { setBusy(false); }
  };

  const del = async (b: Block) => {
    const ok = await confirm({ title: 'Remover bloqueio', message: `Liberar as datas ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} de ${b.property_name}?`, confirmLabel: 'Remover' });
    if (!ok) return;
    try { await api.deleteBlock(b.id); toast('Bloqueio removido', 'ok'); reload(); }
    catch { toast('Erro ao remover', 'err'); }
  };

  const active = useMemo(() => (blocks || []).filter((b) => b.end_date >= todayISO()), [blocks]);
  const past = useMemo(() => (blocks || []).filter((b) => b.end_date < todayISO()), [blocks]);

  return (
    <div className="grid" style={{ gridTemplateColumns: '340px 1fr', gap: 22, alignItems: 'start' }}>
      <div className="card card-pad">
        <div className="section-title">Bloquear datas</div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }}>Marque períodos em que um imóvel está indisponível (reservado, manutenção etc.).</p>
        <div className="field">
          <label>Imóvel</label>
          <select className="select" value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="field"><label>De</label><input className="input" type="date" min={todayISO()} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="field"><label>Até</label><input className="input" type="date" min={form.start_date || todayISO()} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Motivo (opcional)</label>
          <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex: Reservado, Manutenção" />
        </div>
        <button className="btn btn-primary" onClick={add} disabled={busy} style={{ width: '100%' }}>
          <Icon name="calendar" size={16} /> {busy ? 'Bloqueando…' : 'Bloquear período'}
        </button>
      </div>

      <div>
        <div className="section-title">Bloqueios ativos ({active.length})</div>
        {!blocks ? <div className="card card-pad"><p className="muted">Carregando…</p></div>
          : active.length === 0 ? (
            <div className="card"><EmptyState title="Nenhum bloqueio ativo" text="Todos os imóveis estão disponíveis. Bloqueie datas ao lado quando precisar." /></div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="table">
                <thead><tr><th>Imóvel</th><th>Período</th><th>Motivo</th><th></th></tr></thead>
                <tbody>
                  {active.map((b) => (
                    <tr key={b.id}>
                      <td className="strong">{b.property_name}</td>
                      <td>{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => del(b)}><Icon name="trash" size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        {past.length > 0 && (
          <>
            <div className="section-title mt-24">Histórico ({past.length})</div>
            <div className="card" style={{ overflow: 'hidden', opacity: .72 }}>
              <table className="table">
                <tbody>
                  {past.slice(0, 20).map((b) => (
                    <tr key={b.id}>
                      <td className="strong">{b.property_name}</td>
                      <td>{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => del(b)}><Icon name="trash" size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
