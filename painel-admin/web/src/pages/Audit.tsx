import { useEffect, useState } from 'react';
import { api, type AuditEntry } from '../api';
import { EmptyState } from '../ui';

const ACTION: Record<string, { l: string; c: string }> = {
  create: { l: 'Criou', c: 'ok' }, update: { l: 'Editou', c: 'brand' },
  delete: { l: 'Excluiu', c: 'warn' }, login: { l: 'Entrou', c: 'muted' },
  seed: { l: 'Inicializou', c: 'muted' },
};
const ENTITY: Record<string, string> = {
  property: 'Imóvel', user: 'Usuário', block: 'Bloqueio', settings: 'Configurações', auth: 'Sessão',
};
const fmt = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Audit() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  useEffect(() => { api.getAudit(120).then(setItems).catch(() => setItems([])); }, []);

  if (!items) return <div className="card card-pad"><p className="muted">Carregando…</p></div>;
  if (items.length === 0) return <div className="card"><EmptyState title="Sem registros" text="As ações realizadas no painel aparecerão aqui." /></div>;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="table">
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Item</th><th>Detalhe</th></tr></thead>
        <tbody>
          {items.map((a) => {
            const act = ACTION[a.action] || { l: a.action, c: 'muted' };
            return (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmt(a.created_at)}</td>
                <td className="strong">{a.user_name}</td>
                <td><span className={`badge ${act.c}`}>{act.l}</span></td>
                <td>{ENTITY[a.entity] || a.entity}</td>
                <td className="muted">{a.detail || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
