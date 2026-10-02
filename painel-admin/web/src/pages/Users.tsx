import { useEffect, useState } from 'react';
import { api, ApiError, type User, type Role } from '../api';
import { Icon, Modal, RoleBadge, EmptyState, useToast, useConfirm } from '../ui';
import { useAuth } from '../App';

const ROLE_OPTIONS: { v: Role; l: string; desc: string }[] = [
  { v: 'super_admin', l: 'Super Admin', desc: 'Acesso total: usuários, imóveis, configurações e tudo mais.' },
  { v: 'gerente', l: 'Gerente', desc: 'Gerencia imóveis, fotos, bloqueios e configurações. Não mexe em usuários.' },
  { v: 'corretor', l: 'Corretor', desc: 'Edita apenas os imóveis atribuídos a ele e suas fotos/bloqueios.' },
  { v: 'recepcao', l: 'Recepção', desc: 'Gerencia apenas reservas e bloqueios de datas.' },
];

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const reload = () => api.listUsers().then(setList).catch(() => toast('Erro ao carregar', 'err'));
  useEffect(() => { reload(); }, []);

  const toggleActive = async (u: User) => {
    try { await api.updateUser(u.id, { active: !u.active }); reload(); toast(u.active ? 'Usuário desativado' : 'Usuário ativado'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro', 'err'); }
  };
  const del = async (u: User) => {
    const ok = await confirm({ title: 'Excluir usuário', message: `Remover o acesso de "${u.name}" ao painel?`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try { await api.deleteUser(u.id); reload(); toast('Usuário excluído', 'ok'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro', 'err'); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 20 }}>
        <p className="muted" style={{ fontSize: 13.5 }}>Equipe com acesso ao painel. Defina o papel de cada pessoa conforme a responsabilidade.</p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Novo usuário</button>
      </div>

      {!list ? <div className="card card-pad"><p className="muted">Carregando…</p></div>
        : list.length === 0 ? <div className="card"><EmptyState title="Sem usuários" text="Crie o primeiro acesso." /></div>
        : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">{u.name} {u.id === me.id && <span className="badge muted" style={{ marginLeft: 6 }}>você</span>}</td>
                    <td>{u.email}</td>
                    <td><RoleBadge role={u.role} label={u.roleLabel} /></td>
                    <td>{u.active ? <span className="badge ok">Ativo</span> : <span className="badge muted">Inativo</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)} title="Editar"><Icon name="edit" size={14} /></button>
                      {u.id !== me.id && (
                        <>
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => toggleActive(u)} title={u.active ? 'Desativar' : 'Ativar'}>
                            <Icon name={u.active ? 'lock' : 'check'} size={14} />
                          </button>
                          <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => del(u)} title="Excluir"><Icon name="trash" size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {editing && <UserEditor user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { reload(); setEditing(null); }} />}
    </div>
  );
}

function UserEditor({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<Role>(user?.role || 'corretor');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !user;

  const save = async () => {
    if (!name.trim()) { toast('Informe o nome', 'err'); return; }
    if (isNew && (!email.trim() || password.length < 6)) { toast('E-mail e senha (mín. 6) são obrigatórios', 'err'); return; }
    setBusy(true);
    try {
      if (isNew) await api.createUser({ name: name.trim(), email: email.trim(), password, role });
      else await api.updateUser(user.id, { name: name.trim(), role, ...(password ? { password } : {}) });
      toast(isNew ? 'Usuário criado' : 'Usuário atualizado', 'ok');
      onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao salvar', 'err'); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Novo usuário' : `Editar ${user!.name}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <div className="field"><label>Nome completo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do colaborador" /></div>
      <div className="field">
        <label>E-mail</label>
        <input className="input" type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} placeholder="email@mcflats.com.br" />
        {!isNew && <span className="hint">O e-mail não pode ser alterado.</span>}
      </div>
      <div className="field">
        <label>{isNew ? 'Senha' : 'Nova senha (deixe em branco para manter)'}</label>
        <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? 'Mínimo 6 caracteres' : '••••••'} />
      </div>
      <div className="field">
        <label>Papel / nível de acesso</label>
        <div className="grid" style={{ gap: 8 }}>
          {ROLE_OPTIONS.map((r) => (
            <button key={r.v} type="button" onClick={() => setRole(r.v)}
              className="between" style={{
                padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                border: role === r.v ? '1.5px solid var(--brand)' : '1.5px solid var(--line)',
                background: role === r.v ? 'var(--brand-100)' : 'var(--surface)',
              }}>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{r.l}</span>
                <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{r.desc}</span>
              </span>
              {role === r.v && <Icon name="check" size={18} style={{ color: 'var(--brand)', flex: 'none' }} />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
