import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Define a chave ANTES de importar o módulo (ele lê CPF_ENC_KEY no load).
process.env.CPF_ENC_KEY = randomBytes(32).toString('hex');
const { encryptCpf, decryptCpf, cpfEncryptionEnabled } = await import('../src/crypto-cpf.js');

test('criptografia ativa com chave válida de 32 bytes', () => {
  assert.equal(cpfEncryptionEnabled(), true);
});

test('round-trip: cifra e decifra de volta ao original', () => {
  const enc = encryptCpf('52998224725');
  assert.ok(enc.startsWith('enc:'));
  assert.notEqual(enc, '52998224725');           // não é texto claro
  assert.equal(decryptCpf(enc), '52998224725');  // volta ao original
});

test('duas cifragens do mesmo CPF dão saídas diferentes (IV aleatório)', () => {
  assert.notEqual(encryptCpf('52998224725'), encryptCpf('52998224725'));
});

test('valor legado em texto claro passa direto (sem migração)', () => {
  assert.equal(decryptCpf('52998224725'), '52998224725');
});

test('vazio não quebra', () => {
  assert.equal(encryptCpf(''), '');
  assert.equal(decryptCpf(''), '');
  assert.equal(encryptCpf(null), '');
});

test('token adulterado (GCM) falha e devolve null', () => {
  const enc = encryptCpf('52998224725');
  const tampered = enc.slice(0, -4) + 'AAAA';
  assert.equal(decryptCpf(tampered), null);
});
