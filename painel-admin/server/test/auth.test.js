import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cap, canOnProperty, permsFor, ROLES, hashPassword, verifyPassword } from '../src/auth.js';

test('papéis existem e são exatamente 4', () => {
  assert.deepEqual([...ROLES].sort(), ['corretor', 'gerente', 'recepcao', 'super_admin']);
});

test('super_admin tem capacidade plena em tudo', () => {
  for (const c of ['users.manage', 'properties.create', 'properties.edit', 'properties.delete', 'photos.manage', 'blocks.manage', 'settings.edit', 'audit.view']) {
    assert.equal(cap('super_admin', c), true, `super_admin deveria poder ${c}`);
  }
});

test('gerente NÃO gerencia usuários, mas gerencia imóveis/config', () => {
  assert.equal(cap('gerente', 'users.manage'), false);
  assert.equal(cap('gerente', 'properties.edit'), true);
  assert.equal(cap('gerente', 'settings.edit'), true);
});

test('corretor tem escopo "own" e não capacidades globais', () => {
  assert.equal(cap('corretor', 'properties.edit'), 'own');
  assert.equal(cap('corretor', 'photos.manage'), 'own');
  assert.equal(cap('corretor', 'properties.create'), false);
  assert.equal(cap('corretor', 'properties.delete'), false);
  assert.equal(cap('corretor', 'users.manage'), false);
  assert.equal(cap('corretor', 'settings.edit'), false);
});

test('recepcao só gerencia bloqueios/reservas', () => {
  assert.equal(cap('recepcao', 'blocks.manage'), true);
  assert.equal(cap('recepcao', 'properties.edit'), false);
  assert.equal(cap('recepcao', 'users.manage'), false);
});

test('canOnProperty respeita o escopo "own" do corretor', () => {
  const corretor = { id: 'u1', role: 'corretor' };
  const proprioDele = { assigned_to: 'u1' };
  const deOutro = { assigned_to: 'u2' };
  assert.equal(canOnProperty(corretor, 'properties.edit', proprioDele), true, 'edita o próprio');
  assert.equal(canOnProperty(corretor, 'properties.edit', deOutro), false, 'NÃO edita o de outro');
  assert.equal(canOnProperty(corretor, 'properties.create', proprioDele), false, 'não cria');
});

test('canOnProperty: super_admin e gerente agem em qualquer imóvel', () => {
  const deOutro = { assigned_to: 'qualquer' };
  assert.equal(canOnProperty({ id: 'a', role: 'super_admin' }, 'properties.edit', deOutro), true);
  assert.equal(canOnProperty({ id: 'b', role: 'gerente' }, 'properties.edit', deOutro), true);
});

test('permsFor reflete corretamente cada papel', () => {
  assert.equal(permsFor('super_admin').canManageUsers, true);
  assert.equal(permsFor('gerente').canManageUsers, false);
  assert.equal(permsFor('gerente').canEditSettings, true);
  assert.equal(permsFor('corretor').canEditPropertyScope, 'own');
  assert.equal(permsFor('corretor').canManageUsers, false);
  assert.equal(permsFor('recepcao').canManageBlocks, true);
  assert.equal(permsFor('recepcao').canEditProperty, false);
});

test('hash de senha: verifica correta e rejeita errada', () => {
  const h = hashPassword('Senha@Forte123');
  assert.ok(h.startsWith('$2'), 'é um hash bcrypt');
  assert.equal(verifyPassword('Senha@Forte123', h), true);
  assert.equal(verifyPassword('errada', h), false);
});
