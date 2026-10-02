import { useState } from 'react';
import { api, ApiError } from '../api';
import { Icon, ThemeToggle } from '../ui';

export default function Login({ onLogged }: { onLogged: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.login(email.trim(), password);
      onLogged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível entrar');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="bg" />
        <div className="brand" style={{ padding: 0 }}>
          <div className="mark" style={{ width: 44, height: 44, fontSize: 17 }}>MC</div>
          <div className="name" style={{ fontSize: 20 }}>MC<span>Flats</span></div>
        </div>
        <div>
          <h2>Painel de gestão dos seus apartamentos em Ipanema e Leblon.</h2>
          <p className="tagline">Cadastre imóveis, gerencie fotos, bloqueie datas e mantenha o site sempre atualizado. Tudo em um só lugar.</p>
        </div>
        <div style={{ font: '500 12px/1 var(--font)', color: 'rgba(255,255,255,.55)' }}>© {new Date().getFullYear()} MC Flats</div>
      </div>

      <div className="login-form">
        <div className="login-card">
          <div className="between" style={{ marginBottom: 22 }}>
            <div className="brand" style={{ padding: 0 }}>
              <div className="mark">MC</div>
              <div className="name">MC<span>Flats</span></div>
            </div>
            <ThemeToggle />
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>Bem-vindo de volta</h1>
          <p className="lead">Entre com suas credenciais para acessar o painel.</p>

          {err && <div className="login-err">{err}</div>}

          <form onSubmit={submit}>
            <div className="field">
              <label>E-mail</label>
              <input className="input" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="voce@mcflats.com.br" required autoFocus />
            </div>
            <div className="field">
              <label>Senha</label>
              <div className="pw-wrap">
                <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ paddingRight: 42 }} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label="Mostrar senha">
                  <Icon name={show ? 'eyeoff' : 'eye'} size={18} />
                </button>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', padding: '13px', marginTop: 6 }}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
