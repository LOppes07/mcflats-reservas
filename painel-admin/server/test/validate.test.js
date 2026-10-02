import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, minCheckinIso, isSafeExternalUrl } from '../src/validate.js';

test('isValidCpf: aceita CPF válido (com e sem máscara)', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('52998224725'), true);
});

test('isValidCpf: rejeita dígito verificador errado', () => {
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('123.456.789-00'), false);
});

test('isValidCpf: rejeita todos os dígitos iguais e tamanho errado', () => {
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('00000000000'), false);
  assert.equal(isValidCpf('1234567890'), false);   // 10 dígitos
  assert.equal(isValidCpf(''), false);
  assert.equal(isValidCpf(null), false);
});

test('minCheckinIso: antecedência configurável em dias, formato yyyy-mm-dd', () => {
  const ts = new Date(2026, 7, 19, 12, 0, 0).getTime();
  assert.equal(minCheckinIso(ts), '2026-08-20');      // padrão 1 dia (~24h)
  assert.equal(minCheckinIso(ts, 2), '2026-08-21');   // 2 dias (48h)
  assert.equal(minCheckinIso(ts, 0), '2026-08-19');   // sem antecedência
  assert.match(minCheckinIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('isSafeExternalUrl: aceita http(s) público', () => {
  assert.equal(isSafeExternalUrl('https://www.airbnb.com.br/calendar/ical/123.ics'), true);
  assert.equal(isSafeExternalUrl('http://admin.booking.com/feed.ics'), true);
});

test('isSafeExternalUrl: bloqueia loopback, redes privadas e metadata (anti-SSRF)', () => {
  assert.equal(isSafeExternalUrl('http://127.0.0.1:5432/'), false);
  assert.equal(isSafeExternalUrl('http://localhost/admin'), false);
  assert.equal(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isSafeExternalUrl('http://10.0.0.5/'), false);
  assert.equal(isSafeExternalUrl('http://192.168.1.1/'), false);
  assert.equal(isSafeExternalUrl('http://172.16.0.1/'), false);
});

test('isSafeExternalUrl: bloqueia esquemas não-http e lixo', () => {
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
  assert.equal(isSafeExternalUrl('ftp://host/x'), false);
  assert.equal(isSafeExternalUrl('não é url'), false);
  assert.equal(isSafeExternalUrl(''), false);
});
