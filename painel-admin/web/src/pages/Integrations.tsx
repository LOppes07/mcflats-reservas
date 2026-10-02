import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Icon, useToast } from '../ui';

type Status = { configured: boolean; connected: boolean; sampleCount?: number; error?: string } | null;

export default function Integrations() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'import' | 'sync' | 'publish'>('');
  const [last, setLast] = useState<string>('');

  const load = () => { setLoading(true); api.staysStatus().then(setStatus).catch(() => setStatus({ configured: false, connected: false })).finally(() => setLoading(false)); };
  useEffect(load, []);

  const doImport = async () => {
    setBusy('import');
    try {
      const r = await api.staysImport();
      setLast(`Importação: ${r.created} novo(s), ${r.updated} atualizado(s), ${r.photos} foto(s). ${r.active} ativo(s) no ar e ${r.inactive} inativo(s) do Stays ficam em rascunho.`);
      toast('Imóveis importados do Stays', 'ok');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Erro na importação', 'err'); }
    finally { setBusy(''); }
  };
  const doSync = async () => {
    setBusy('sync');
    try {
      const r = await api.staysSyncAvailability();
      setLast(`Disponibilidade: ${r.imported} período(s) em ${r.properties} imóvel(is)${r.failed ? `, ${r.failed} falha(s)` : ''}.`);
      toast('Disponibilidade sincronizada', 'ok');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Erro na sincronização', 'err'); }
    finally { setBusy(''); }
  };

  const doPublish = async () => {
    setBusy('publish');
    try {
      const r = await api.staysPublish();
      setLast(`Publicação: ${r.published} imóvel(is) do Stays no ar, ${r.hidden} demo(s) ocultado(s).`);
      toast('Imóveis publicados', 'ok');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao publicar', 'err'); }
    finally { setBusy(''); }
  };

  const connected = status?.configured && status?.connected;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>Stays (PMS)</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Importe imóveis, fotos e a disponibilidade real direto da conta Stays do cliente.</p>
          </div>
          <span className={`badge ${connected ? 'ok' : status?.configured ? 'warn' : 'muted'}`}>
            {loading ? 'verificando…' : connected ? 'conectado' : status?.configured ? 'sem conexão' : 'não configurado'}
          </span>
        </div>

        {!loading && !status?.configured && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, fontSize: 13, lineHeight: 1.6 }}>
            <b>Falta configurar as credenciais no servidor.</b> Peça ao suporte do Stays as credenciais da Open API (client_id e client_secret) e o domínio da conta. Depois defina no <code>.env</code> do servidor:
            <pre style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginTop: 10, overflow: 'auto', fontSize: 12 }}>{`STAYS_BASE_URL=https://SUACONTA.stays.net
STAYS_CLIENT_ID=...
STAYS_CLIENT_SECRET=...`}</pre>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={load}><Icon name="activity" size={14} /> Verificar novamente</button>
          </div>
        )}

        {!loading && status?.configured && !status?.connected && (
          <div className="badge warn" style={{ display: 'block', padding: 12, lineHeight: 1.5 }}>
            Credenciais definidas, mas a conexão falhou{status.error ? `: ${status.error}` : ''}. Confira client_id/secret e o domínio.
            <div><button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={load}><Icon name="activity" size={14} /> Tentar de novo</button></div>
          </div>
        )}

        {!loading && connected && (
          <>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Conta conectada{typeof status?.sampleCount === 'number' ? ` · ${status.sampleCount > 0 ? 'imóveis disponíveis na API' : 'nenhum imóvel retornado'}` : ''}.</p>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={doImport} disabled={!!busy}>
                <Icon name="upload" size={15} /> {busy === 'import' ? 'Importando…' : 'Importar imóveis do Stays'}
              </button>
              <button className="btn btn-ghost" onClick={doSync} disabled={!!busy}>
                <Icon name="calendar" size={15} /> {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar disponibilidade'}
              </button>
              <button className="btn btn-ghost" onClick={doPublish} disabled={!!busy}>
                <Icon name="eye" size={15} /> {busy === 'publish' ? 'Publicando…' : 'Publicar importados e ocultar demos'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
              A importação cria/atualiza imóveis casando por <code>stays_id</code> e <b>não apaga</b> nada. Imóveis novos entram como <b>rascunho</b> (não aparecem no site até você publicar em Imóveis). Preço e destaque continuam sob seu controle no painel.
            </p>
          </>
        )}

        {last && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-2)', fontSize: 13 }}><Icon name="check" size={14} style={{ color: 'var(--ok)' }} /> {last}</div>}
      </div>
    </div>
  );
}
