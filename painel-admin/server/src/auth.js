import bcrypt from 'bcryptjs';

export const ROLES = ['super_admin', 'gerente', 'corretor', 'recepcao'];
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  gerente: 'Gerente',
  corretor: 'Corretor',
  recepcao: 'Recepção',
};

export const hashPassword = (pw) => bcrypt.hashSync(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

/**
 * Matriz de capacidades por papel. `true` = pode em todos; `'own'` = só nos
 * imóveis atribuídos ao próprio usuário; ausência = não pode.
 */
const CAPS = {
  super_admin: {
    'users.manage': true, 'properties.create': true, 'properties.edit': true,
    'properties.delete': true, 'photos.manage': true, 'blocks.manage': true,
    'settings.edit': true, 'audit.view': true,
  },
  gerente: {
    'properties.create': true, 'properties.edit': true, 'properties.delete': true,
    'photos.manage': true, 'blocks.manage': true, 'settings.edit': true, 'audit.view': true,
  },
  corretor: {
    'properties.edit': 'own', 'photos.manage': 'own', 'blocks.manage': 'own',
  },
  recepcao: {
    'blocks.manage': true,
  },
};

/** Capacidade genérica (ignora escopo por imóvel). Retorna true|'own'|false. */
export function cap(role, capability) {
  return CAPS[role]?.[capability] ?? false;
}

/** Todo mundo autenticado enxerga imóveis (leitura). */
export function canView() {
  return true;
}

/**
 * Pode agir sobre ESTE imóvel? Considera o escopo 'own' do corretor.
 * property pode ser null (ex: criar novo).
 */
export function canOnProperty(user, capability, property = null) {
  const c = cap(user.role, capability);
  if (c === true) return true;
  if (c === 'own' && property) return property.assigned_to === user.id;
  return false;
}

/** Resumo de permissões enviado ao front para montar a navegação/botões. */
export function permsFor(role) {
  return {
    role,
    label: ROLE_LABELS[role],
    canManageUsers: cap(role, 'users.manage') === true,
    canCreateProperty: cap(role, 'properties.create') === true,
    canEditProperty: !!cap(role, 'properties.edit'),
    canEditPropertyScope: cap(role, 'properties.edit'), // true | 'own' | false
    canDeleteProperty: cap(role, 'properties.delete') === true,
    canManagePhotos: !!cap(role, 'photos.manage'),
    canManageBlocks: !!cap(role, 'blocks.manage'),
    canEditSettings: cap(role, 'settings.edit') === true,
    canViewAudit: cap(role, 'audit.view') === true,
  };
}
