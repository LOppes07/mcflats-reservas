import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, photoSrc, type Property, type Photo } from '../api';
import { Icon, Modal, StatusBadge, EmptyState, useToast, useConfirm } from '../ui';
import { useAuth } from '../App';

const fmtMoney = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR');
const HOODS = [{ v: 'ipanema', l: 'Ipanema' }, { v: 'leblon', l: 'Leblon' }];
const PRESET_AMENITIES = [
  'Wi-Fi de alta velocidade', 'Cozinha completa', 'Arrumação diária', 'Recepção 24 horas',
  'Ar-condicionado', 'Vaga privativa', 'Estação de trabalho', 'Smart TV', 'Varanda',
  'Máquina de lavar', 'Academia', 'Piscina', 'Pet friendly', 'Vista mar',
];

type Assignee = { id: string; name: string; role: string; roleLabel: string };

export default function Properties() {
  const { user, perms } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Property[] | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [q, setQ] = useState('');
  const [hood, setHood] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Property | 'new' | null>(null);

  const reload = () => api.listProperties().then(setList).catch(() => toast('Erro ao carregar imóveis', 'err'));
  useEffect(() => {
    reload();
    if (perms.canEditProperty) api.listAssignees().then(setAssignees).catch(() => {});
  }, []);

  const canEditThis = (p: Property) =>
    perms.canEditPropertyScope === true || (perms.canEditPropertyScope === 'own' && p.assigned_to === user.id);

  const filtered = useMemo(() => {
    if (!list) return [];
    return list.filter((p) =>
      (hood === 'all' || p.hood === hood) &&
      (status === 'all' || p.status === status) &&
      (!q || p.name.toLowerCase().includes(q.toLowerCase())),
    );
  }, [list, q, hood, status]);

  return (
    <div>
      <div className="between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input className="input" placeholder="Buscar imóvel…" value={q} onChange={(e) => setQ(e.target.value)}
              style={{ width: 220, paddingLeft: 14 }} />
          </div>
          <select className="select" value={hood} onChange={(e) => setHood(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">Todos os bairros</option>
            {HOODS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">Todos os status</option>
            <option value="published">Publicados</option>
            <option value="draft">Rascunhos</option>
          </select>
        </div>
        {perms.canCreateProperty && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Novo imóvel
          </button>
        )}
      </div>

      {!list ? (
        <div className="card card-pad"><p className="muted">Carregando…</p></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="Nenhum imóvel encontrado"
            text={q || hood !== 'all' || status !== 'all' ? 'Ajuste os filtros para ver mais.' : 'Comece cadastrando o primeiro apartamento.'}
            action={perms.canCreateProperty && <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Novo imóvel</button>} />
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {filtered.map((p) => (
            <PropertyCard key={p.id} p={p} canEdit={canEditThis(p)} onOpen={() => setEditing(p)} />
          ))}
        </div>
      )}

      {editing && (
        <PropertyEditor
          property={editing === 'new' ? null : editing}
          assignees={assignees}
          canEdit={editing === 'new' ? perms.canCreateProperty : canEditThis(editing)}
          canAssign={perms.canEditPropertyScope === true}
          canManagePhotos={editing === 'new' ? perms.canCreateProperty : (perms.canManagePhotos && canEditThis(editing))}
          canDelete={perms.canDeleteProperty}
          onClose={() => setEditing(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function PropertyCard({ p, canEdit, onOpen }: { p: Property; canEdit: boolean; onOpen: () => void }) {
  const cover = p.photos[0]?.url;
  return (
    <div className="card" style={{ overflow: 'hidden', cursor: canEdit ? 'pointer' : 'default' }} onClick={canEdit ? onOpen : undefined}>
      <div style={{ position: 'relative', aspectRatio: '16/10', background: 'var(--surface-2)' }}>
        {cover
          ? <img src={photoSrc(cover)} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div className="flex" style={{ width: '100%', height: '100%', justifyContent: 'center', color: 'var(--muted)', gap: 8, fontSize: 12, fontWeight: 600 }}><Icon name="upload" size={16} /> Sem foto</div>}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          <StatusBadge status={p.status} />
          {p.featured && <span className="badge gold"><Icon name="star" size={11} /> Destaque</span>}
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10 }} className="badge muted">
          <Icon name="star" size={11} /> {p.photos.length}
        </div>
      </div>
      <div className="card-pad" style={{ padding: 16 }}>
        <div className="between">
          <span className="badge brand" style={{ textTransform: 'capitalize' }}>{p.hood}</span>
          <span style={{ fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--display)' }}>{fmtMoney(p.price)}<span className="muted" style={{ fontWeight: 500, fontSize: 12 }}> /noite</span></span>
        </div>
        <div style={{ font: '700 16px/1.3 var(--display)', color: 'var(--ink)', margin: '10px 0 6px' }}>{p.name}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {p.bedrooms === 0 ? 'Studio' : `${p.bedrooms} quarto${p.bedrooms > 1 ? 's' : ''}`} · {p.guests} hóspedes
          {p.assigned_name && <> · <span style={{ color: 'var(--brand)' }}>{p.assigned_name}</span></>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ editor */
type Form = Omit<Property, 'photos' | 'position' | 'updated_at' | 'assigned_name'>;
const emptyForm = (): Form => ({
  id: '', name: '', hood: 'ipanema', bedrooms: 1, bathrooms: 1, guests: 2, price: 0,
  rating: 5, reviews: 0, tag: '', description: '', amenities: [...PRESET_AMENITIES.slice(0, 8)],
  address: '', status: 'draft', assigned_to: null, featured: false, min_nights: 1,
});

function PropertyEditor({ property, assignees, canEdit, canAssign, canManagePhotos, canDelete, onClose, onChanged }: {
  property: Property | null; assignees: Assignee[];
  canEdit: boolean; canAssign: boolean; canManagePhotos: boolean; canDelete: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState<Form>(property ? { ...property } : emptyForm());
  const [photos, setPhotos] = useState<Photo[]>(property?.photos || []);
  const [id, setId] = useState(property?.id || '');
  const [busy, setBusy] = useState(false);
  const [amenInput, setAmenInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = !id;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const save = async () => {
    if (!f.name.trim()) { toast('Informe o nome do imóvel', 'err'); return; }
    setBusy(true);
    try {
      const payload = { ...f };
      if (id) {
        await api.updateProperty(id, payload);
        toast('Imóvel atualizado', 'ok');
        onChanged();
        onClose();
      } else {
        const created = await api.createProperty(payload);
        setId(created.id);
        setF({ ...created });
        setPhotos(created.photos);
        toast('Imóvel criado. Agora adicione as fotos', 'ok');
        onChanged();
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erro ao salvar', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({ title: 'Excluir imóvel', message: `Tem certeza que deseja excluir "${f.name}"? Esta ação não pode ser desfeita e remove também as fotos.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try { await api.deleteProperty(id); toast('Imóvel excluído', 'ok'); onChanged(); onClose(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro ao excluir', 'err'); }
  };

  // ----- photos -----
  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length || !id) return;
    setBusy(true);
    try { const added = await api.uploadPhotos(id, files); setPhotos((p) => [...p, ...added]); toast(`${added.length} foto(s) enviada(s)`, 'ok'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro no upload', 'err'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const addUrl = async () => {
    const url = prompt('Cole a URL da imagem:');
    if (!url || !id) return;
    try { const ph = await api.addPhotoUrl(id, url.trim()); setPhotos((p) => [...p, ph]); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'URL inválida', 'err'); }
  };
  const delPhoto = async (photoId: string) => {
    try { await api.deletePhoto(photoId); setPhotos((p) => p.filter((x) => x.id !== photoId)); }
    catch { toast('Erro ao remover foto', 'err'); }
  };
  const persistOrder = async (ordered: Photo[]) => {
    setPhotos(ordered);
    if (id) api.reorderPhotos(id, ordered.map((p) => p.id)).catch(() => {});
  };
  const makeCover = (photoId: string) => {
    const target = photos.find((p) => p.id === photoId);
    if (!target) return;
    persistOrder([target, ...photos.filter((p) => p.id !== photoId)]);
    toast('Foto de capa definida');
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = photos.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persistOrder(next);
  };

  const toggleAmenity = (a: string) =>
    set('amenities', f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a]);
  const addAmenity = () => {
    const v = amenInput.trim();
    if (v && !f.amenities.includes(v)) set('amenities', [...f.amenities, v]);
    setAmenInput('');
  };
  const allAmenities = Array.from(new Set([...PRESET_AMENITIES, ...f.amenities]));

  const disabled = !canEdit;

  return (
    <Modal
      title={isNew ? 'Novo imóvel' : f.name || 'Editar imóvel'}
      wide
      onClose={onClose}
      footer={
        <>
          {!isNew && canDelete && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}><Icon name="trash" size={15} /> Excluir</button>}
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          {canEdit && <button className="btn btn-primary" onClick={save} disabled={busy}><Icon name="check" size={15} /> {busy ? 'Salvando…' : isNew ? 'Criar imóvel' : 'Salvar alterações'}</button>}
        </>
      }
    >
      <div className="row" style={{ gridTemplateColumns: '1.3fr 1fr', alignItems: 'start', gap: 28 }}>
        {/* -------- dados -------- */}
        <div>
          <div className="field">
            <label>Nome do imóvel</label>
            <input className="input" value={f.name} disabled={disabled} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Beach Star 403" />
          </div>
          <div className="row">
            <div className="field">
              <label>Bairro</label>
              <select className="select" value={f.hood} disabled={disabled} onChange={(e) => set('hood', e.target.value as Form['hood'])}>
                {HOODS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={f.status} disabled={disabled} onChange={(e) => set('status', e.target.value as Form['status'])}>
                <option value="published">Publicado (aparece no site)</option>
                <option value="draft">Rascunho (oculto)</option>
              </select>
            </div>
          </div>
          <label className="switch" style={{ margin: '2px 0 16px', opacity: disabled ? 0.6 : 1 }}>
            <input type="checkbox" checked={!!f.featured} disabled={disabled} onChange={(e) => set('featured', e.target.checked)} />
            <span className="track" />
            <span>Destacar na página inicial <span className="muted" style={{ fontWeight: 500 }}>(aparece na seção “em destaque” da home)</span></span>
          </label>
          <div className="row-3">
            <div className="field"><label>Diária (R$)</label><input className="input" type="number" min={0} value={f.price} disabled={disabled} onChange={(e) => set('price', num(e.target.value))} /></div>
            <div className="field"><label>Quartos</label><input className="input" type="number" min={0} value={f.bedrooms} disabled={disabled} onChange={(e) => set('bedrooms', num(e.target.value))} /></div>
            <div className="field"><label>Banheiros</label><input className="input" type="number" min={0} value={f.bathrooms} disabled={disabled} onChange={(e) => set('bathrooms', num(e.target.value))} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Hóspedes</label><input className="input" type="number" min={1} value={f.guests} disabled={disabled} onChange={(e) => set('guests', num(e.target.value))} /></div>
            <div className="field"><label>Avaliação</label><input className="input" type="number" min={0} max={5} step={0.1} value={f.rating} disabled={disabled} onChange={(e) => set('rating', num(e.target.value))} /></div>
            <div className="field"><label>Nº avaliações</label><input className="input" type="number" min={0} value={f.reviews} disabled={disabled} onChange={(e) => set('reviews', num(e.target.value))} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Estadia mínima (noites)</label><input className="input" type="number" min={1} value={f.min_nights} disabled={disabled} onChange={(e) => set('min_nights', Math.max(1, num(e.target.value)))} /></div>
          </div>
          <div className="field">
            <label>Selo (opcional)</label>
            <input className="input" value={f.tag} disabled={disabled} onChange={(e) => set('tag', e.target.value)} placeholder="Ex: Vista mar, Mais reservado…" />
          </div>
          <div className="field">
            <label>Endereço (uso interno / mapa)</label>
            <input className="input" value={f.address} disabled={disabled} onChange={(e) => set('address', e.target.value)} placeholder="Rua, número, bairro" />
          </div>
          {canAssign && (
            <div className="field">
              <label>Corretor responsável</label>
              <select className="select" value={f.assigned_to || ''} disabled={disabled} onChange={(e) => set('assigned_to', e.target.value || null)}>
                <option value="">Ninguém</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.roleLabel})</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Descrição</label>
            <textarea className="textarea" value={f.description} disabled={disabled} onChange={(e) => set('description', e.target.value)} placeholder="Descreva o apartamento, diferenciais, localização…" />
          </div>

          <div className="field">
            <label>Comodidades</label>
            <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              {allAmenities.map((a) => {
                const on = f.amenities.includes(a);
                return (
                  <button key={a} type="button" disabled={disabled} onClick={() => toggleAmenity(a)}
                    className={`badge ${on ? 'brand' : 'muted'}`}
                    style={{ cursor: disabled ? 'default' : 'pointer', border: on ? '1px solid var(--brand)' : '1px solid var(--line)', padding: '7px 12px' }}>
                    {on && <Icon name="check" size={11} />} {a}
                  </button>
                );
              })}
            </div>
            {!disabled && (
              <div className="flex gap-8 mt-8">
                <input className="input" value={amenInput} onChange={(e) => setAmenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAmenity())} placeholder="Adicionar outra comodidade" style={{ height: 38 }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addAmenity}>Adicionar</button>
              </div>
            )}
          </div>
        </div>

        {/* -------- fotos -------- */}
        <div>
          <label style={{ font: '700 11px/1 var(--font)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>Fotos</label>
          {isNew ? (
            <div className="dropzone mt-8" style={{ cursor: 'default' }}>
              <Icon name="lock" size={20} /><div className="mt-8">Salve o imóvel primeiro para adicionar as fotos.</div>
            </div>
          ) : (
            <>
              {canManagePhotos && (
                <div className="flex gap-8 mt-8" style={{ marginBottom: 12 }}>
                  <button className="dropzone" style={{ flex: 1, padding: 14 }} onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={18} /><div style={{ marginTop: 6 }}>Enviar fotos</div>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onUpload(e.target.files)} />
                  <button className="btn btn-ghost btn-icon" title="Adicionar por URL" onClick={addUrl}><Icon name="external" size={16} /></button>
                </div>
              )}
              {photos.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Nenhuma foto ainda. {canManagePhotos && 'Envie a primeira acima.'}</p>
              ) : (
                <div className="photos">
                  {photos.map((ph, i) => (
                    <div className="photo" key={ph.id}>
                      <img src={photoSrc(ph.url)} alt="" loading="lazy" />
                      {i === 0 && <span className="cover-tag">Capa</span>}
                      {canManagePhotos && (
                        <div className="ph-actions">
                          <button title="Mover para esquerda" onClick={() => move(i, -1)} disabled={i === 0}>‹</button>
                          {i !== 0 && <button title="Definir como capa" onClick={() => makeCover(ph.id)}><Icon name="star" size={14} /></button>}
                          <button title="Excluir" onClick={() => delPhoto(ph.id)}><Icon name="trash" size={14} /></button>
                          <button title="Mover para direita" onClick={() => move(i, 1)} disabled={i === photos.length - 1}>›</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="muted mt-16" style={{ fontSize: 11.5, lineHeight: 1.5 }}>A primeira foto é a capa exibida no site. Passe o mouse sobre a foto para reordenar, definir capa ou excluir.</p>
            </>
          )}
        </div>
      </div>

      {!isNew && canEdit && <IcalSection propertyId={id} />}
    </Modal>
  );
}

/* ============================================================ sincronização iCal */
function IcalSection({ propertyId }: { propertyId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [feeds, setFeeds] = useState<{ id: string; url: string; label: string; last_sync: string | null; last_status: string | null }[]>([]);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const exportUrl = `${location.origin}/api/ical/${propertyId}.ics`;
  const load = () => api.listIcalFeeds(propertyId).then(setFeeds).catch(() => {});
  useEffect(() => { load(); }, [propertyId]);

  const add = async () => {
    if (!/^https?:\/\//.test(url.trim())) { toast('Cole o link iCal do Airbnb ou Booking', 'err'); return; }
    setBusy(true);
    try { await api.addIcalFeed(propertyId, { url: url.trim(), label: label.trim() }); setUrl(''); setLabel(''); toast('Calendário conectado — sincronizando…', 'ok'); await api.syncIcal().catch(() => {}); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Erro', 'err'); }
    finally { setBusy(false); }
  };
  const del = async (id: string) => {
    if (!(await confirm({ title: 'Remover calendário', message: 'As datas importadas por este calendário serão liberadas.', confirmLabel: 'Remover', danger: true }))) return;
    await api.deleteIcalFeed(id).catch(() => {}); load();
  };
  const sync = async () => { setBusy(true); try { const r = await api.syncIcal(); toast(`Sincronizado — ${r.imported} período(s) importado(s)`, 'ok'); load(); } catch { toast('Erro ao sincronizar', 'err'); } finally { setBusy(false); } };
  const copy = () => { navigator.clipboard?.writeText(exportUrl).then(() => toast('Link copiado'), () => {}); };

  return (
    <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--line)' }}>
      <div className="section-title">Sincronização com Airbnb / Booking (iCal)</div>
      <div className="field" style={{ marginBottom: 18 }}>
        <label>1. Link deste imóvel (cole no Airbnb/Booking)</label>
        <div className="flex gap-8">
          <input className="input" readOnly value={exportUrl} onFocus={(e) => e.target.select()} />
          <button className="btn btn-ghost btn-sm" onClick={copy} style={{ flex: 'none' }}><Icon name="external" size={14} /> Copiar</button>
        </div>
        <span className="hint">Assim o Airbnb/Booking bloqueiam as datas que você reserva ou bloqueia aqui.</span>
      </div>
      <div className="field">
        <label>2. Conectar calendários do Airbnb/Booking (importa as datas ocupadas de lá)</label>
        {feeds.length > 0 && (
          <div className="grid" style={{ gap: 8, marginBottom: 10 }}>
            {feeds.map((f) => (
              <div key={f.id} className="between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="strong" style={{ fontSize: 13 }}>{f.label || 'Calendário'}</div>
                  <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>{f.last_status || 'aguardando 1ª sincronização'}{f.last_sync ? ' · ' + f.last_sync : ''}</div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => del(f.id)}><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '2 1 220px' }} placeholder="Cole o link iCal (Airbnb/Booking)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input" style={{ flex: '1 1 120px' }} placeholder="Rótulo (ex: Airbnb)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={busy}><Icon name="plus" size={14} /> Conectar</button>
          {feeds.length > 0 && <button className="btn btn-ghost btn-sm" onClick={sync} disabled={busy}>{busy ? 'Sincronizando…' : 'Sincronizar agora'}</button>}
        </div>
      </div>
    </div>
  );
}
