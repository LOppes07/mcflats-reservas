import { useEffect, useMemo, useState } from 'react';
import { api, type Cleaning } from '../api';
import { Icon, Spinner, EmptyState, useToast } from '../ui';
import { useAuth } from '../App';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOOD = { ipanema: 'Ipanema', leblon: 'Leblon' } as const;
const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const fmtDate = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

function presets() {
  const now = new Date();
  const plus = (days: number) => { const d = new Date(now); d.setDate(d.getDate() + days); return iso(d); };
  const first = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const last = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return [
    { key: '7', label: 'Próximos 7 dias', from: iso(now), to: plus(7) },
    { key: '30', label: 'Próximos 30 dias', from: iso(now), to: plus(30) },
    { key: 'mes', label: 'Este mês', from: first, to: last },
  ];
}

export default function Cleaning() {
  const P = useMemo(presets, []);
  const { perms } = useAuth();
  const toast = useToast();
  const canEdit = perms.canManageBlocks;
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(P[0].from);
  const [to, setTo] = useState(P[0].to);
  const [list, setList] = useState<Cleaning[] | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = () => { setList(null); api.listCleanings(from, to).then(setList).catch(() => setList([])); };
  useEffect(load, [from, to]);

  const pickPreset = (k: string) => { const p = P.find((x) => x.key === k); if (p) { setPreset(k); setFrom(p.from); setTo(p.to); } };

  const patch = (t: Cleaning, d: Partial<Pick<Cleaning, 'status' | 'assignee' | 'notes'>>) => {
    const next = { ...t, ...d };
    setList((cur) => cur?.map((x) => (x.reservation_id === t.reservation_id ? next : x)) ?? cur);
    api.updateCleaning(t.reservation_id, { status: next.status, assignee: next.assignee, notes: next.notes })
      .catch(() => toast('Não foi possível salvar', 'err'));
  };

  const shown = (list ?? []).filter((t) => (onlyPending ? t.status === 'pendente' : true));
  const pending = (list ?? []).filter((t) => t.status === 'pendente').length;
  const done = (list ?? []).length - pending;

  // agrupa por data
  const groups = useMemo(() => {
    const m = new Map<string, Cleaning[]>();
    for (const t of shown) { const g = m.get(t.date) ?? []; g.push(t); m.set(t.date, g); }
    return [...m.entries()];
  }, [shown]);

  return (
    <div className="grid" style={{ gap: 22 }}>
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
        {list && (
          <div className="between" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
            <div className="flex gap-8" style={{ fontSize: 13 }}>
              <span className="badge warn">{pending} pendente(s)</span>
              <span className="badge ok">{done} concluída(s)</span>
            </div>
            <label className="flex gap-8" style={{ alignItems: 'center', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Só pendentes
            </label>
          </div>
        )}
      </div>

      {!list && <Spinner />}
      {list && shown.length === 0 && (
        <EmptyState title="Nenhuma limpeza no período" text="As limpezas aparecem automaticamente na data de saída de cada reserva confirmada." />
      )}

      {groups.map(([date, items]) => (
        <div key={date}>
          <div className="section-title" style={{ marginTop: 0, textTransform: 'capitalize' }}>{fmtDate(date)}</div>
          <div className="grid" style={{ gap: 10 }}>
            {items.map((t) => (
              <CleaningCard key={t.reservation_id} t={t} canEdit={canEdit} onPatch={patch} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CleaningCard({ t, canEdit, onPatch }: { t: Cleaning; canEdit: boolean; onPatch: (t: Cleaning, d: Partial<Cleaning>) => void }) {
  const [assignee, setAssignee] = useState(t.assignee);
  const [notes, setNotes] = useState(t.notes);
  useEffect(() => { setAssignee(t.assignee); setNotes(t.notes); }, [t.reservation_id]);
  const done = t.status === 'concluida';
  const wa = t.guest_phone ? `https://wa.me/${onlyDigits(t.guest_phone).length <= 11 ? '55' + onlyDigits(t.guest_phone) : onlyDigits(t.guest_phone)}` : null;

  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${done ? 'var(--ok)' : t.sameDayCheckin ? 'var(--warn)' : 'var(--line)'}`, opacity: done ? 0.72 : 1 }}>
      <div className="between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="strong" style={{ fontSize: 14 }}>{t.property_name || 'Imóvel removido'}</span>
            {t.hood && <span className="muted" style={{ fontSize: 12 }}>· {HOOD[t.hood]}</span>}
            {t.sameDayCheckin && !done && (
              <span className="badge warn" style={{ fontSize: 10 }}>ENTRA NO MESMO DIA</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            Saída de {t.guest_name || 'hóspede'}
            {wa && <> · <a href={wa} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>WhatsApp</a></>}
          </div>
        </div>
        <button
          className={`btn btn-sm ${done ? 'btn-ghost' : 'btn-primary'}`}
          disabled={!canEdit}
          onClick={() => onPatch(t, { status: done ? 'pendente' : 'concluida' })}
          style={{ flex: 'none' }}
        >
          <Icon name="check" size={15} /> {done ? 'Concluída' : 'Marcar limpa'}
        </button>
      </div>

      {canEdit && (
        <div className="flex gap-8" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 160px' }} placeholder="Responsável pela limpeza" value={assignee}
            onChange={(e) => setAssignee(e.target.value)} onBlur={() => assignee !== t.assignee && onPatch(t, { assignee })} />
          <input className="input" style={{ flex: '2 1 220px' }} placeholder="Observações (ex: trocar enxoval, vistoria)" value={notes}
            onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== t.notes && onPatch(t, { notes })} />
        </div>
      )}
      {!canEdit && (t.assignee || t.notes) && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{[t.assignee, t.notes].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  );
}
