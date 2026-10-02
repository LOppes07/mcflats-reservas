import { useEffect, useState } from 'react';
import { css, Box } from './css';
import { guestApi, type Guest, type Reservation } from './apiData';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtDate = (s: string) => { const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? s : d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const fmtMoney = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR');

const eyeOn = 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const eyeOff = 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22';
const Eye = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={off ? eyeOff : eyeOn} /></svg>
);

const overlay = 'position:fixed; inset:0; z-index:95; background:rgba(15,26,43,.55); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:44px 20px; overflow:auto; animation:fadeIn .25s ease both;';
const card = "background:var(--surface); border-radius:20px; box-shadow:0 40px 100px -30px rgba(10,24,45,.6); width:520px; max-width:100%; animation:pop .3s cubic-bezier(.2,.8,.2,1) both;";

export function useGuest() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = () => guestApi.me().then((r) => setGuest(r.guest)).catch(() => setGuest(null)).finally(() => setReady(true));
  useEffect(() => { refresh(); }, []);
  const logout = async () => { try { await guestApi.logout(); } catch { /* noop */ } setGuest(null); };
  return { guest, ready, setGuest, logout };
}

/* ---------------- login / cadastro ---------------- */
export function AuthModal({ onClose, onAuthed, waNumber, onPrivacy }: { onClose: () => void; onAuthed: (g: Guest) => void; waNumber: string; onPrivacy: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Login com Google. O client_id vem do servidor (runtime). O botão é sempre visível;
  // fica funcional quando o client_id está configurado (fluxo OAuth token client).
  const [gid, setGid] = useState('');
  const [gReady, setGReady] = useState(false);
  useEffect(() => { guestApi.config().then((c) => setGid(c.googleClientId || '')).catch(() => {}); }, []);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.accounts?.oauth2) { setGReady(true); return; }
    let s = document.getElementById('gsi-script') as HTMLScriptElement | null;
    const onLoad = () => setGReady(true);
    if (!s) { s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.id = 'gsi-script'; document.head.appendChild(s); }
    s.addEventListener('load', onLoad);
    return () => s?.removeEventListener('load', onLoad);
  }, []);
  const googleSignIn = () => {
    setErr('');
    if (!gid) { setErr('O login com Google está sendo ativado. Use e-mail e senha por enquanto.'); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gg = (window as any).google;
    if (!gReady || !gg?.accounts?.oauth2) { setErr('Carregando o Google, tente novamente em instantes.'); return; }
    const client = gg.accounts.oauth2.initTokenClient({
      client_id: gid,
      scope: 'openid email profile',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: async (resp: any) => {
        if (!resp?.access_token) { setErr('Login com Google cancelado.'); return; }
        try { const r = await guestApi.google({ accessToken: resp.access_token }); onAuthed(r.guest); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível entrar com o Google'); }
      },
    });
    client.requestAccessToken();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (mode === 'register' && !consent) { setErr('É necessário aceitar a Política de Privacidade para criar a conta.'); return; }
    setBusy(true);
    try {
      const r = mode === 'login'
        ? await guestApi.login(f.email.trim(), f.password)
        : await guestApi.register({ name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim() });
      onAuthed(r.guest);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível continuar'); setBusy(false); }
  };
  const forgot = () => { try { window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent('Olá! Esqueci a senha da minha conta MC Flats e gostaria de redefinir.'), '_blank'); } catch { /* noop */ } };

  const gInput = "width:100%; border:1px solid rgba(255,255,255,.16); border-radius:13px; padding:15px 16px; font:500 14px/1.1 'Manrope',sans-serif; color:#fff; outline:none; background:rgba(255,255,255,.08);";

  return (
    <div style={css(overlay + ' align-items:center;')} onClick={onClose}>
      <div
        className="authglass"
        style={css("position:relative; width:404px; max-width:100%; border-radius:26px; padding:34px 30px 30px; background:linear-gradient(160deg, rgba(255,255,255,.10), rgba(18,48,90,.96) 62%); border:1px solid rgba(255,255,255,.14); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px); box-shadow:0 50px 120px -30px rgba(4,12,26,.85); animation:pop .3s cubic-bezier(.2,.8,.2,1) both;")}
        onClick={(e) => e.stopPropagation()}
      >
        <Box as="span" onClick={onClose} aria-label="Fechar" style="position:absolute; top:16px; right:16px; width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,.1); display:flex; align-items:center; justify-content:center; font:400 18px/1 system-ui,sans-serif; color:rgba(255,255,255,.85); cursor:pointer;" hover="background:rgba(255,255,255,.22);">×</Box>

        <div style={css('display:flex; flex-direction:column; align-items:center; text-align:center; margin-bottom:22px;')}>
          <div style={css('width:54px; height:54px; border-radius:50%; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; margin-bottom:16px; box-shadow:0 10px 26px -10px rgba(0,0,0,.5);')}>
            <span style={css("font:800 17px/1 'Montserrat',sans-serif; color:#e3c074; letter-spacing:.02em;")}>MC</span>
          </div>
          <div style={css("font:800 22px/1.1 'Montserrat',sans-serif; color:#fff; margin-bottom:7px;")}>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie a sua conta'}</div>
          <div style={css("font:400 13px/1.5 'Manrope',sans-serif; color:rgba(255,255,255,.62); max-width:300px;")}>{mode === 'login' ? 'Entre para acompanhar as suas reservas.' : 'Guarde as suas reservas e acompanhe o status de cada uma.'}</div>
        </div>

        {err && <div style={css("background:rgba(224,90,90,.16); border:1px solid rgba(224,90,90,.3); color:#ffb4b4; padding:11px 14px; border-radius:11px; font:600 12.5px/1.4 'Manrope',sans-serif; margin-bottom:16px; text-align:center;")}>{err}</div>}

        <form onSubmit={submit}>
          <div style={css('display:flex; flex-direction:column; gap:11px;')}>
            {mode === 'register' && (
              <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome completo" required style={css(gInput)} />
            )}
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="E-mail" required autoComplete="email" style={css(gInput)} />
            {mode === 'register' && (
              <input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="WhatsApp (opcional)" style={css(gInput)} />
            )}
            <div style={css('position:relative;')}>
              <input type={show ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={mode === 'register' ? 'Senha (mínimo 6 caracteres)' : 'Senha'} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} style={css(gInput + ' padding-right:46px;')} />
              <Box as="span" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} style="position:absolute; right:14px; top:50%; transform:translateY(-50%); color:rgba(255,255,255,.6); cursor:pointer;"><Eye off={show} /></Box>
            </div>
          </div>

          {mode === 'login' && (
            <Box onClick={forgot} style="text-align:right; font:600 12px/1 'Manrope',sans-serif; color:rgba(255,255,255,.72); cursor:pointer; margin-top:11px;" hover="color:#fff;">Esqueci minha senha</Box>
          )}
          {mode === 'register' && (
            <label style={css("display:flex; align-items:flex-start; gap:9px; margin-top:14px; cursor:pointer; font:500 12px/1.55 'Manrope',sans-serif; color:rgba(255,255,255,.68);")}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={css('margin-top:2px; width:15px; height:15px; accent-color:#e3c074; cursor:pointer; flex:none;')} />
              <span>Li e aceito a <Box as="span" onClick={(e) => { e?.preventDefault(); e?.stopPropagation(); onPrivacy(); }} style="color:#e3c074; font-weight:700; text-decoration:underline; cursor:pointer;">Política de Privacidade</Box> e o tratamento dos meus dados para gerenciar as minhas reservas.</span>
            </label>
          )}

          <Box as="button" type="submit" disabled={busy} style={`width:100%; background:#e3c074; border:none; border-radius:100px; padding:15px; text-align:center; font:800 14.5px/1 'Manrope',sans-serif; color:#12305a; cursor:pointer; margin-top:18px;`} hover="background:#d6ad63;">
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta grátis'}
          </Box>
        </form>

        <div style={css("display:flex; align-items:center; gap:12px; margin:18px 0; color:rgba(255,255,255,.5); font:600 10.5px/1 'Manrope',sans-serif; text-transform:uppercase; letter-spacing:.1em;")}>
          <span style={css('flex:1; height:1px; background:rgba(255,255,255,.14);')} />ou<span style={css('flex:1; height:1px; background:rgba(255,255,255,.14);')} />
        </div>
        <Box as="button" type="button" onClick={googleSignIn} style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; background:linear-gradient(180deg,#2b2e33,#1f2125); border:1px solid rgba(255,255,255,.14); border-radius:100px; padding:13px; font:700 14px/1 'Manrope',sans-serif; color:#fff; cursor:pointer;" hover="filter:brightness(1.18);">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.98h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" /><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-2.98c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.76-2.11-6.7-4.94H1.29v3.09C3.26 21.3 7.31 24 12 24z" /><path fill="#FBBC05" d="M5.3 14.33c-.24-.72-.38-1.49-.38-2.33s.14-1.61.38-2.33V6.58H1.29A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.29 5.42l4.01-3.09z" /><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l4.01 3.09C6.24 6.86 8.88 4.75 12 4.75z" /></svg>
          Continuar com Google
        </Box>

        <div style={css("text-align:center; margin-top:22px; font:500 12.5px/1 'Manrope',sans-serif; color:rgba(255,255,255,.6);")}>
          {mode === 'login' ? 'Ainda não tem conta? ' : 'Já tem uma conta? '}
          <Box as="span" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} style="color:#fff; font-weight:700; text-decoration:underline; cursor:pointer;">
            {mode === 'login' ? 'Criar grátis' : 'Entrar'}
          </Box>
        </div>
      </div>
    </div>
  );
}

/* ---------------- política de privacidade (LGPD) ---------------- */
export function PrivacyModal({ email, onClose }: { email: string; onClose: () => void }) {
  const h = "font:800 15px/1.3 'Montserrat',sans-serif; color:#1c3a5f; margin:22px 0 8px;";
  const p = "font:400 13.5px/1.7 'Manrope',sans-serif; color:#42556b; margin-bottom:8px;";
  return (
    <div style={css(overlay)} onClick={onClose}>
      <div style={css(card + ' width:640px;')} onClick={(e) => e.stopPropagation()}>
        <div style={css('display:flex; align-items:center; justify-content:space-between; padding:22px 26px; border-bottom:1px solid #eef3f8; position:sticky; top:0; background:var(--surface); border-radius:20px 20px 0 0;')}>
          <div style={css("font:800 20px/1.1 'Montserrat',sans-serif; color:#1c3a5f;")}>Política de Privacidade</div>
          <Box as="span" onClick={onClose} aria-label="Fechar" style="width:32px; height:32px; border-radius:50%; background:var(--surface-2); display:flex; align-items:center; justify-content:center; font:600 16px/1 'Manrope',sans-serif; color:#1c3a5f; cursor:pointer;">✕</Box>
        </div>
        <div style={css('padding:8px 26px 26px; max-height:66vh; overflow:auto;')}>
          <p style={css(p + ' margin-top:16px;')}>Esta Política explica como a MC Flats trata os seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).</p>

          <div style={css(h)}>1. Quem é o controlador</div>
          <p style={css(p)}>A MC Flats é o nome fantasia de M C Empreendimentos Imobiliários e Turismo Ltda, inscrita no CNPJ 68.688.837/0001-09, com sede na Av. Presidente Antônio Carlos, 54, Sala 1102, Centro, Rio de Janeiro/RJ. Contato do encarregado pelo tratamento de dados: {email}.</p>

          <div style={css(h)}>2. Quais dados coletamos</div>
          <p style={css(p)}>Nome, e-mail e telefone que você informa ao solicitar uma reserva ou criar uma conta; e as datas, imóvel e número de hóspedes do seu pedido. Não coletamos dados sensíveis nem dados de pagamento neste site.</p>

          <div style={css(h)}>3. Para que usamos</div>
          <p style={css(p)}>Para responder e gerenciar a sua solicitação de reserva, entrar em contato pelo WhatsApp/e-mail, e manter o histórico das suas reservas na sua conta. Base legal: execução de procedimentos preliminares a um contrato e o seu consentimento (art. 7º, I e V, da LGPD).</p>

          <div style={css(h)}>4. Com quem compartilhamos</div>
          <p style={css(p)}>Não vendemos os seus dados. Podemos compartilhar apenas com prestadores necessários à operação da hospedagem, sempre no limite da finalidade acima.</p>

          <div style={css(h)}>5. Por quanto tempo guardamos</div>
          <p style={css(p)}>Mantemos os dados pelo tempo necessário para atender à sua solicitação e cumprir obrigações legais. Depois disso, são eliminados ou anonimizados.</p>

          <div style={css(h)}>6. Os seus direitos</div>
          <p style={css(p)}>Você pode, a qualquer momento, solicitar acesso, correção, portabilidade ou exclusão dos seus dados, além de revogar o consentimento. Basta enviar um pedido para {email}.</p>

          <div style={css(h)}>7. Cookies</div>
          <p style={css(p)}>Usamos armazenamento local apenas para lembrar os seus favoritos e manter você conectado à sua conta. Não usamos cookies de rastreamento de terceiros.</p>

          <p style={css(p + ' margin-top:18px; color:#9aa9bb; font-size:12px;')}>Última atualização: agosto de 2026. Esta política pode ser revisada — a versão vigente está sempre disponível aqui.</p>
        </div>
        <div style={css('padding:14px 26px; border-top:1px solid #eef3f8; display:flex; justify-content:flex-end;')}>
          <Box onClick={onClose} style="font:700 14px/1 'Manrope',sans-serif; color:#fff; background:#15499a; border-radius:10px; padding:12px 22px; cursor:pointer;" hover="background:#0f3a82;">Entendi</Box>
        </div>
      </div>
    </div>
  );
}

/* ---------------- minha conta ---------------- */
const STATUS: Record<string, [string, string, string]> = {
  solicitada: ['Solicitada', '#9a7526', '#f3e9d3'],
  confirmada: ['Confirmada', '#1f7a45', '#e2f3e8'],
  cancelada: ['Cancelada', '#a5342f', '#fbe9e9'],
};

export function AccountModal({ guest, onClose, onLogout, onDeleted }: { guest: Guest; onClose: () => void; onLogout: () => void; onDeleted: () => void }) {
  const [list, setList] = useState<Reservation[] | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  useEffect(() => { guestApi.reservations().then(setList).catch(() => setList([])); }, []);
  const del = async () => {
    if (!window.confirm('Tem certeza? Isto apaga a sua conta e os seus dados pessoais de forma permanente.')) return;
    setDelBusy(true);
    try { await guestApi.deleteAccount(); onDeleted(); } catch { setDelBusy(false); }
  };

  return (
    <div style={css(overlay)} onClick={onClose}>
      <div style={css(card + ' width:600px;')} onClick={(e) => e.stopPropagation()}>
        <div style={css('display:flex; align-items:center; justify-content:space-between; padding:22px 26px; border-bottom:1px solid #eef3f8;')}>
          <div>
            <div style={css("font:800 20px/1.1 'Montserrat',sans-serif; color:#1c3a5f;")}>Olá, {guest.name.split(' ')[0]}</div>
            <div style={css("font:400 12.5px/1 'Manrope',sans-serif; color:#9aa9bb; margin-top:4px;")}>{guest.email}</div>
          </div>
          <Box as="span" onClick={onClose} aria-label="Fechar" style="width:32px; height:32px; border-radius:50%; background:var(--surface-2); display:flex; align-items:center; justify-content:center; font:600 16px/1 'Manrope',sans-serif; color:#1c3a5f; cursor:pointer;">✕</Box>
        </div>
        <div style={css('padding:22px 26px; max-height:60vh; overflow:auto;')}>
          <div style={css("font:700 12px/1 'Montserrat',sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#9aa9bb; margin-bottom:14px;")}>Minhas reservas</div>
          {!list ? <div style={css('color:#9aa9bb; font:500 14px/1 Manrope,sans-serif; padding:20px 0;')}>Carregando…</div>
            : list.length === 0 ? (
              <div style={css('text-align:center; padding:30px 10px; color:#5a6b80;')}>
                <div style={css("font:700 16px/1.3 'Manrope',sans-serif; color:#1c3a5f; margin-bottom:6px;")}>Você ainda não tem reservas</div>
                <div style={css("font:400 13.5px/1.6 'Manrope',sans-serif;")}>Quando você solicitar uma reserva, ela aparece aqui com o status atualizado.</div>
              </div>
            ) : (
              <div style={css('display:flex; flex-direction:column; gap:12px;')}>
                {list.map((r) => {
                  const [lbl, fg, bg] = STATUS[r.status] || STATUS.solicitada;
                  return (
                    <div key={r.id} style={css('border:1px solid #e7eef5; border-radius:14px; padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:14px; background:var(--surface);')}>
                      <div>
                        <div style={css("font:700 15px/1.3 'Manrope',sans-serif; color:#1c3a5f;")}>{r.property_name || 'Imóvel'}</div>
                        <div style={css("font:400 12.5px/1.5 'Manrope',sans-serif; color:#5a6b80; margin-top:4px;")}>{fmtDate(r.checkin)} até {fmtDate(r.checkout)} · {r.nights} noites · {r.guests} hóspedes</div>
                        <div style={css("font:600 12px/1 'Manrope',sans-serif; color:#9aa9bb; margin-top:6px;")}>Código {r.code} · {fmtMoney(r.total)}</div>
                      </div>
                      <span style={css(`flex:none; font:700 11px/1 'Manrope',sans-serif; color:${fg}; background:${bg}; border-radius:100px; padding:7px 13px;`)}>{lbl}</span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
        <div style={css('padding:16px 26px; border-top:1px solid #eef3f8; display:flex; align-items:center; justify-content:space-between; gap:12px;')}>
          <Box onClick={del} style={`font:600 12.5px/1 'Manrope',sans-serif; color:#9aa9bb; cursor:pointer;`} hover="color:#c0392b;">{delBusy ? 'Excluindo…' : 'Excluir minha conta e meus dados'}</Box>
          <Box onClick={onLogout} style="font:700 13.5px/1 'Manrope',sans-serif; color:#c0392b; background:#fbe9e9; border-radius:10px; padding:12px 20px; cursor:pointer;" hover="background:#f5d5d5;">Sair da conta</Box>
        </div>
      </div>
    </div>
  );
}
