import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { isAvailable } from '../src/availability.js';

let db;
const PROP = 'p1';

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE blocks (property_id TEXT, start_date TEXT, end_date TEXT);
    CREATE TABLE reservations (id TEXT, property_id TEXT, status TEXT, checkin TEXT, checkout TEXT);
  `);
});

const addBlock = (s, e) => db.prepare('INSERT INTO blocks VALUES (?,?,?)').run(PROP, s, e);
const addResv = (id, ci, co, status = 'confirmada') =>
  db.prepare('INSERT INTO reservations VALUES (?,?,?,?,?)').run(id, PROP, status, ci, co);

test('datas livres → disponível', () => {
  assert.equal(isAvailable(db, PROP, '2026-09-10', '2026-09-15'), true);
});

test('bloqueio sobreposto → indisponível', () => {
  addBlock('2026-09-10', '2026-09-15');
  assert.equal(isAvailable(db, PROP, '2026-09-12', '2026-09-14'), false, 'dentro do bloqueio');
  assert.equal(isAvailable(db, PROP, '2026-09-14', '2026-09-18'), false, 'entra no último dia bloqueado');
});

test('bloqueio: check-in no dia seguinte ao fim do bloqueio → disponível', () => {
  addBlock('2026-09-10', '2026-09-15');
  assert.equal(isAvailable(db, PROP, '2026-09-16', '2026-09-20'), true);
});

test('reserva CONFIRMADA sobreposta → indisponível', () => {
  addResv('r1', '2026-10-01', '2026-10-05', 'confirmada');
  assert.equal(isAvailable(db, PROP, '2026-10-03', '2026-10-07'), false);
});

test('reserva SOLICITADA (não confirmada) NÃO segura a data', () => {
  addResv('r1', '2026-10-01', '2026-10-05', 'solicitada');
  assert.equal(isAvailable(db, PROP, '2026-10-02', '2026-10-04'), true);
});

test('check-out encosta no check-in de outra reserva → disponível (meio-aberto)', () => {
  addResv('r1', '2026-10-05', '2026-10-10', 'confirmada');
  assert.equal(isAvailable(db, PROP, '2026-10-01', '2026-10-05'), true, 'sai no dia que a outra entra');
});

test('ignoreReservationId: a própria reserva não conflita consigo mesma', () => {
  addResv('r1', '2026-11-01', '2026-11-05', 'confirmada');
  assert.equal(isAvailable(db, PROP, '2026-11-01', '2026-11-05', 'r1'), true, 'ignora r1');
  assert.equal(isAvailable(db, PROP, '2026-11-01', '2026-11-05', 'outra'), false, 'sem ignorar, conflita');
});

test('outro imóvel não interfere', () => {
  db.prepare('INSERT INTO blocks VALUES (?,?,?)').run('p2', '2026-09-10', '2026-09-20');
  assert.equal(isAvailable(db, PROP, '2026-09-12', '2026-09-14'), true);
});
