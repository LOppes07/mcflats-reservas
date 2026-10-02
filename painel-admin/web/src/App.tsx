import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, type User, type Perms } from './api';
import { Providers, Icon, ThemeToggle, Spinner, useToast } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Reservations from './pages/Reservations';
import Blocks from './pages/Blocks';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Cleaning from './pages/Cleaning';
import Integrations from './pages/Integrations';
import Audit from './pages/Audit';

/* ---------------- auth context ---------------- */
type Auth = { user: User; perms: Perms; refresh: () => void; logout: () => void };
const AuthContext = createContext<Auth>(null as unknown as Auth);
export const useAuth = () => useContext(AuthContext);

/* ---------------- hash routing ---------------- */
function useRoute() {
  const parse = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/')[0];
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (route: string) => { location.hash = `#/${route}`; };

const NAV: { to: string; label: string; icon: string; show: (p: Perms) => boolean }[] = [
  { to: 'dashboard', label: 'Visão geral', icon: 'dashboard', show: () => true },
  { to: 'imoveis', label: 'Imóveis', icon: 'building', show: () => true },
  { to: 'pedidos', label: 'Pedidos de reserva', icon: 'inbox', show: (p) => p.canManageBlocks },
  { to: 'reservas', label: 'Bloqueio de datas', icon: 'calendar', show: (p) => p.canManageBlocks },
  { to: 'limpeza', label: 'Limpeza', icon: 'check', show: (p) => p.canManageBlocks },
  { to: 'relatorios', label: 'Relatórios', icon: 'activity', show: (p) => p.canViewAudit },
  { to: 'usuarios', label: 'Usuários', icon: 'users', show: (p) => p.canManageUsers },
  { to: 'config', label: 'Configurações', icon: 'settings', show: (p) => p.canEditSettings },
  { to: 'integracoes', label: 'Integrações', icon: 'external', show: (p) => p.role === 'super_admin' },
  { to: 'auditoria', label: 'Auditoria', icon: 'activity', show: (p) => p.canViewAudit },
];

const PAGE_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: 'Visão geral', sub: 'Resumo da operação MC Flats' },
  imoveis: { title: 'Imóveis', sub: 'Cadastro, fotos e disponibilidade dos apartamentos' },
  pedidos: { title: 'Pedidos de reserva', sub: 'Solicitações feitas pelos hóspedes no site' },
  reservas: { title: 'Bloqueio de datas', sub: 'Bloqueie datas indisponíveis por imóvel' },
  limpeza: { title: 'Limpeza', sub: 'Turnovers gerados na saída de cada reserva confirmada' },
  relatorios: { title: 'Relatórios', sub: 'Ocupação, diária média e receita por período' },
  usuarios: { title: 'Usuários', sub: 'Equipe com acesso ao painel e seus papéis' },
  config: { title: 'Configurações', sub: 'Contatos, textos e dados exibidos no site' },
  integracoes: { title: 'Integrações', sub: 'Conecte o Stays e importe imóveis e disponibilidade' },
  auditoria: { title: 'Auditoria', sub: 'Histórico de ações realizadas no painel' },
};

function Shell() {
  const { user, perms, logout } = useAuth();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [route]);

  const allowed = NAV.filter((n) => n.show(perms));
  const current = allowed.find((n) => n.to === route) ? route : 'dashboard';
  const meta = PAGE_META[current];
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="mark">MC</div>
          <div>
            <div className="name">MC<span>Flats</span></div>
            <div className="sub">Painel</div>
          </div>
        </div>
        <nav className="nav">
          <div className="group-label">Operação</div>
          {allowed.map((n) => (
            <a key={n.to} href={`#/${n.to}`} className={current === n.to ? 'active' : ''}>
              <Icon name={n.icon} className="ico" />{n.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <a href="/" target="_blank" rel="noreferrer" className="nav" style={{ display: 'block' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', color: 'var(--sidebar-muted)', fontWeight: 600, fontSize: 13.5 }}>
              <Icon name="external" className="ico" /> Ver site público
            </span>
          </a>
          <div className="side-user">
            <div className="avatar">{initials}</div>
            <div className="who">
              <b>{user.name}</b>
              <small>{perms.label}</small>
            </div>
            <button className="x-btn" onClick={logout} title="Sair" style={{ color: 'var(--sidebar-muted)' }}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="flex gap-12">
            <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
            <div className="title">
              <h1>{meta.title}</h1>
              <p>{meta.sub}</p>
            </div>
          </div>
          <div className="actions">
            <ThemeToggle />
          </div>
        </header>
        <main className="content">
          {current === 'dashboard' && <Dashboard />}
          {current === 'imoveis' && <Properties />}
          {current === 'pedidos' && <Reservations />}
          {current === 'reservas' && <Blocks />}
          {current === 'limpeza' && <Cleaning />}
          {current === 'usuarios' && <Users />}
          {current === 'config' && <Settings />}
          {current === 'integracoes' && <Integrations />}
          {current === 'relatorios' && <Reports />}
          {current === 'auditoria' && <Audit />}
        </main>
      </div>
    </div>
  );
}

function Gate() {
  const [state, setState] = useState<{ loading: boolean; auth: { user: User; perms: Perms } | null }>({ loading: true, auth: null });
  const toast = useToast();

  const load = () => api.me().then((a) => setState({ loading: false, auth: a })).catch(() => setState({ loading: false, auth: null }));
  useEffect(() => { load(); }, []);

  if (state.loading) return <Spinner />;
  if (!state.auth) return <Login onLogged={load} />;

  const logout = async () => {
    try { await api.logout(); } catch { /* noop */ }
    toast('Sessão encerrada');
    setState({ loading: false, auth: null });
  };

  return (
    <AuthContext.Provider value={{ user: state.auth.user, perms: state.auth.perms, refresh: load, logout }}>
      <Shell />
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <Providers>
      <Gate />
    </Providers>
  );
}
