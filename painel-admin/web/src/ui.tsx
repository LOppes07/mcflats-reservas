import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Role } from './api';

/* ============================================================ icons */
const PATHS: Record<string, string> = {
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2M17 21V11h2a2 2 0 0 1 2 2v8',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  x: 'M18 6L6 18M6 6l12 12',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22',
  check: 'M20 6L9 17l-5-5',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  menu: 'M3 12h18M3 6h18M3 18h18',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
};

export function Icon({ name, size = 18, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

/* ============================================================ theme */
type ThemeCtx = { theme: 'light' | 'dark'; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('mcadmin:theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('mcadmin:theme', theme); } catch { /* noop */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} title={theme === 'light' ? 'Tema escuro' : 'Tema claro'} aria-label="Alternar tema">
      <Icon name={theme === 'light' ? 'moon' : 'sun'} />
    </button>
  );
}

/* ============================================================ toasts */
type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'info' };
const ToastContext = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'info' ? '' : t.kind}`}>
            <Icon name={t.kind === 'err' ? 'x' : 'check'} size={16} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ============================================================ confirm */
type ConfirmOpts = { title: string; message: string; confirmLabel?: string; danger?: boolean };
const ConfirmContext = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="overlay" onClick={() => close(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <h3 style={{ marginBottom: 10 }}>{state.title}</h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{state.message}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => close(false)}>Cancelar</button>
              <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {state.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/* ============================================================ modal */
export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================================================ small bits */
export const RoleBadge = ({ role, label }: { role: Role; label: string }) => (
  <span className={`badge role-${role}`}>{label}</span>
);
export const StatusBadge = ({ status }: { status: 'published' | 'draft' }) =>
  status === 'published'
    ? <span className="badge ok"><Icon name="check" size={12} /> Publicado</span>
    : <span className="badge muted">Rascunho</span>;

export const Spinner = () => <div className="center-screen"><div className="spinner" /></div>;

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{text}</p>{action}</div>;
}

/* ============================================================ providers root */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
