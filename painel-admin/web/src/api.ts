// -------------------------------------------------------------- tipos
export type Role = 'super_admin' | 'gerente' | 'corretor' | 'recepcao';

export interface User {
  id: string; name: string; email: string; role: Role; roleLabel: string;
  active?: boolean; created_at?: string;
}
export interface Perms {
  role: Role; label: string;
  canManageUsers: boolean; canCreateProperty: boolean; canEditProperty: boolean;
  canEditPropertyScope: boolean | 'own'; canDeleteProperty: boolean;
  canManagePhotos: boolean; canManageBlocks: boolean; canEditSettings: boolean; canViewAudit: boolean;
}
export interface Photo { id: string; url: string; position: number; }
export interface Property {
  id: string; name: string; hood: 'ipanema' | 'leblon';
  bedrooms: number; bathrooms: number; guests: number; price: number;
  rating: number; reviews: number; tag: string; description: string;
  amenities: string[]; address: string; status: 'published' | 'draft';
  assigned_to: string | null; assigned_name: string | null;
  featured: boolean; min_nights: number;
  position: number; updated_at?: string; photos: Photo[];
}
export interface Block {
  id: string; property_id: string; property_name?: string;
  start_date: string; end_date: string; reason: string; created_at?: string;
}
export interface Settings { [key: string]: string; }
export interface Stats {
  properties: number; published: number; draft: number; users: number;
  blocksUpcoming: number; avgPrice: number; byHood: { ipanema: number; leblon: number };
  reservationsPending?: number; guests?: number;
}
export interface Reservation {
  id: string; code: string; property_name: string | null; guest_id: string | null;
  name: string; email: string; phone: string;
  checkin: string; checkout: string; guests: number; nights: number;
  price: number; cleaning: number; total: number;
  cpf?: string | null; payment_method?: 'pix' | 'cartao' | null; doc_file?: string | null; has_card?: boolean;
  status: 'solicitada' | 'confirmada' | 'cancelada'; created_at: string;
}
export interface ReportRow {
  id: string; name: string; hood: 'ipanema' | 'leblon';
  availNights: number; occNights: number; revenue: number;
  occupancy: number; adr: number; revpar: number;
}
export interface Report {
  from: string; to: string; windowNights: number;
  totals: { properties: number; availNights: number; occNights: number; occupancy: number; revenue: number; adr: number; revpar: number };
  funnel: { solicitada: number; confirmada: number; cancelada: number; requests: number; conversion: number };
  properties: ReportRow[];
}
export interface Cleaning {
  reservation_id: string; property_id: string; property_name: string | null; hood: 'ipanema' | 'leblon' | null;
  date: string; checkin: string; guest_name: string; guest_phone: string;
  status: 'pendente' | 'concluida'; assignee: string; notes: string; sameDayCheckin: boolean;
}
export interface AuditEntry {
  id: string; user_name: string; action: string; entity: string;
  entity_id: string | null; detail: string; created_at: string;
}

// -------------------------------------------------------------- helpers
const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error || 'Erro na requisição', res.status);
  return data as T;
}

const j = (body: unknown) => JSON.stringify(body);

// Resolve a URL de exibição de uma foto (arquivos locais vêm como /uploads/..)
export const photoSrc = (url: string) => (url.startsWith('http') ? url : url);

// -------------------------------------------------------------- endpoints
export const api = {
  // auth
  login: (email: string, password: string) =>
    req<{ user: User; perms: Perms }>('/auth/login', { method: 'POST', body: j({ email, password }) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => req<{ user: User; perms: Perms }>('/auth/me'),

  // users
  listUsers: () => req<User[]>('/users'),
  listAssignees: () => req<{ id: string; name: string; role: Role; roleLabel: string }[]>('/assignees'),
  createUser: (d: { name: string; email: string; password: string; role: Role }) =>
    req<User>('/users', { method: 'POST', body: j(d) }),
  updateUser: (id: string, d: Partial<{ name: string; role: Role; active: boolean; password: string }>) =>
    req<User>(`/users/${id}`, { method: 'PATCH', body: j(d) }),
  deleteUser: (id: string) => req<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  // properties
  listProperties: () => req<Property[]>('/properties'),
  getProperty: (id: string) => req<Property>(`/properties/${id}`),
  createProperty: (d: Partial<Property>) => req<Property>('/properties', { method: 'POST', body: j(d) }),
  updateProperty: (id: string, d: Partial<Property>) => req<Property>(`/properties/${id}`, { method: 'PATCH', body: j(d) }),
  deleteProperty: (id: string) => req<{ ok: boolean }>(`/properties/${id}`, { method: 'DELETE' }),
  reorderProperties: (ids: string[]) => req<{ ok: boolean }>('/properties-order', { method: 'PATCH', body: j({ ids }) }),

  // photos
  uploadPhotos: (propId: string, files: FileList | File[]) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('file', f));
    return req<Photo[]>(`/properties/${propId}/photos`, { method: 'POST', body: fd });
  },
  addPhotoUrl: (propId: string, url: string) =>
    req<Photo>(`/properties/${propId}/photos/url`, { method: 'POST', body: j({ url }) }),
  reorderPhotos: (propId: string, ids: string[]) =>
    req<{ ok: boolean }>(`/properties/${propId}/photos/order`, { method: 'PATCH', body: j({ ids }) }),
  deletePhoto: (photoId: string) => req<{ ok: boolean }>(`/photos/${photoId}`, { method: 'DELETE' }),

  // blocks
  listBlocks: () => req<Block[]>('/blocks'),
  propertyBlocks: (id: string) => req<Block[]>(`/properties/${id}/blocks`),
  createBlock: (propId: string, d: { start_date: string; end_date: string; reason: string }) =>
    req<Block>(`/properties/${propId}/blocks`, { method: 'POST', body: j(d) }),
  deleteBlock: (id: string) => req<{ ok: boolean }>(`/blocks/${id}`, { method: 'DELETE' }),

  // ical
  listIcalFeeds: (propId: string) => req<{ id: string; url: string; label: string; last_sync: string | null; last_status: string | null }[]>(`/properties/${propId}/ical`),
  addIcalFeed: (propId: string, d: { url: string; label: string }) => req<{ id: string }>(`/properties/${propId}/ical`, { method: 'POST', body: j(d) }),
  deleteIcalFeed: (feedId: string) => req<{ ok: boolean }>(`/ical/${feedId}`, { method: 'DELETE' }),
  syncIcal: () => req<{ ok: boolean; imported: number }>('/ical/sync', { method: 'POST' }),

  // reservations
  listReservations: () => req<Reservation[]>('/admin/reservations'),
  setReservationStatus: (id: string, status: Reservation['status']) =>
    req<{ ok: boolean }>(`/admin/reservations/${id}`, { method: 'PATCH', body: j({ status }) }),
  getReservationCard: (id: string) =>
    req<{ titular: string; numero: string; validade: string; cvv: string; bandeira: string }>(`/admin/reservations/${id}/card`),

  // settings / audit / stats
  getSettings: () => req<Settings>('/settings'),
  saveSettings: (s: Settings) => req<Settings>('/settings', { method: 'PUT', body: j(s) }),
  uploadSettingImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ url: string }>('/settings/image', { method: 'POST', body: fd });
  },
  getAudit: (limit = 60) => req<AuditEntry[]>(`/audit?limit=${limit}`),
  getStats: () => req<Stats>('/stats'),
  getReport: (from: string, to: string) => req<Report>(`/reports?from=${from}&to=${to}`),
  listCleanings: (from: string, to: string) => req<Cleaning[]>(`/cleanings?from=${from}&to=${to}`),
  updateCleaning: (reservationId: string, d: { status: Cleaning['status']; assignee: string; notes: string }) =>
    req<{ ok: boolean }>(`/cleanings/${reservationId}`, { method: 'PATCH', body: j(d) }),

  // stays (integração PMS)
  staysStatus: () => req<{ configured: boolean; connected: boolean; sampleCount?: number; sample?: unknown; error?: string }>('/stays/status'),
  staysImport: () => req<{ ok: boolean; total: number; created: number; updated: number; photos: number; active: number; inactive: number }>('/stays/import', { method: 'POST' }),
  staysSyncAvailability: () => req<{ ok: boolean; properties: number; imported: number; failed: number }>('/stays/sync-availability', { method: 'POST' }),
  staysPublish: () => req<{ ok: boolean; published: number; hidden: number }>('/stays/publish', { method: 'POST' }),
};
