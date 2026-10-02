import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Settings as S } from '../api';
import { Icon, useToast } from '../ui';

type FieldDef = { key: string; label: string; hint?: string; area?: boolean; wide?: boolean };
type ImgDef = { key: string; label: string; hint?: string };
type Tab = { id: string; label: string; icon: string; desc: string; fields?: FieldDef[]; images?: ImgDef[] };

const IMAGES: ImgDef[] = [
  { key: 'hero_image', label: 'Banner principal (topo do site)', hint: 'Imagem horizontal, ideal 1600×900 ou maior. É o fundo do topo da página inicial.' },
  { key: 'image_ipanema', label: 'Card do bairro Ipanema', hint: 'Foto vertical/quadrada usada no card de Ipanema na home.' },
  { key: 'image_leblon', label: 'Card do bairro Leblon', hint: 'Foto vertical/quadrada usada no card de Leblon na home.' },
];

const TABS: Tab[] = [
  {
    id: 'contato', label: 'Contato', icon: 'users', desc: 'Telefones, e-mail, endereço e redes sociais exibidos no site.',
    fields: [
      { key: 'contact_whatsapp', label: 'WhatsApp (só números, com DDI)', hint: 'Ex: 5521981366864 — usado em todos os botões de WhatsApp do site.' },
      { key: 'contact_phone', label: 'Telefone exibido' },
      { key: 'contact_email', label: 'E-mail de reservas' },
      { key: 'address', label: 'Endereço / região', wide: true },
      { key: 'instagram_url', label: 'Instagram (URL completa)' },
      { key: 'facebook_url', label: 'Facebook (URL completa)' },
    ],
  },
  { id: 'imagens', label: 'Imagens', icon: 'upload', desc: 'Troque o banner do topo e as fotos dos bairros na página inicial.', images: IMAGES },
];

function ImageField({ def, value, onChange }: { def: ImgDef; value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { const { url } = await api.uploadSettingImage(file); onChange(url); toast('Imagem enviada — clique em Salvar para publicar', 'ok'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro no upload', 'err'); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ font: '700 11px/1 var(--font)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>{def.label}</label>
      <div className="flex gap-16" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 200, height: 120, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 10 }}>Usando a imagem padrão do site</span>}
        </div>
        <div style={{ flex: 1 }}>
          <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
              <Icon name="upload" size={14} /> {busy ? 'Enviando…' : value ? 'Trocar imagem' : 'Enviar imagem'}
            </button>
            {value && <button className="btn btn-ghost btn-sm" onClick={() => onChange('')} title="Voltar ao padrão"><Icon name="trash" size={13} /> Remover</button>}
          </div>
          {def.hint && <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{def.hint}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const [data, setData] = useState<S | null>(null);
  const [tab, setTab] = useState('contato');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api.getSettings().then(setData).catch(() => toast('Erro ao carregar', 'err')); }, []);

  const set = (k: string, v: string) => { setData((d) => ({ ...(d as S), [k]: v })); setDirty(true); };
  const save = async () => {
    if (!data) return;
    setBusy(true);
    try { await api.saveSettings(data); toast('Configurações salvas. O site já reflete as mudanças', 'ok'); setDirty(false); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao salvar', 'err'); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="card card-pad"><p className="muted">Carregando…</p></div>;
  const active = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card card-pad">
        <div style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ margin: 0 }}>{active.label}</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{active.desc}</p>
        </div>
        {active.images && active.images.map((im) => (
          <ImageField key={im.key} def={im} value={data[im.key] || ''} onChange={(v) => set(im.key, v)} />
        ))}
        {active.fields && (
          <div className="row">
            {active.fields.map((fd) => (
              <div className="field" key={fd.key} style={fd.wide ? { gridColumn: '1 / -1' } : undefined}>
                <label>{fd.label}</label>
                {fd.area
                  ? <textarea className="textarea" value={data[fd.key] || ''} onChange={(e) => set(fd.key, e.target.value)} />
                  : <input className="input" value={data[fd.key] || ''} onChange={(e) => set(fd.key, e.target.value)} />}
                {fd.hint && <span className="hint">{fd.hint}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-12" style={{ position: 'sticky', bottom: 16, marginTop: 18 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty} style={{ padding: '12px 22px' }}>
          <Icon name="check" size={16} /> {busy ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {dirty && <span className="badge warn">Alterações não salvas</span>}
      </div>
    </div>
  );
}
