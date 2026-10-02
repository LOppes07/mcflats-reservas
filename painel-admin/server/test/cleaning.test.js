import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listTurnovers, upsertCleaning } from '../src/cleaning.js';

// Banco em memória com o mínimo do schema real — 100% isolado, não toca produção.
let db;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE properties (id TEXT PRIMARY KEY, name TEXT, hood TEXT, status TEXT DEFAULT 'published');
    CREATE TABLE reservations (id TEXT PRIMARY KEY, property_id TEXT, checkin TEXT, checkout TEXT,
      status TEXT DEFAULT 'solicitada', name TEXT DEFAULT '', phone TEXT DEFAULT '');
    CREATE TABLE cleaning_status (reservation_id TEXT PRIMARY KEY, status TEXT DEFAULT 'pendente',
      assignee TEXT DEFAULT '', notes TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')));
  `);
  db.prepare("INSERT INTO properties (id,name,hood) VALUES ('p1','Flat 1','ipanema'),('p2','Flat 2','leblon')").run();
});

const addResv = (id, pid, ci, co, status = 'confirmada', name = 'Hóspede', phone = '') =>
  db.prepare('INSERT INTO reservations (id,property_id,checkin,checkout,status,name,phone) VALUES (?,?,?,?,?,?,?)')
    .run(id, pid, ci, co, status, name, phone);

test('turnover é derivado do checkout de reserva confirmada', () => {
  addResv('r1', 'p1', '2026-08-15', '2026-08-20');
  const rows = listTurnovers(db, '2026-08-07', '2026-09-06');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-08-20');
  assert.equal(rows[0].property_name, 'Flat 1');
  assert.equal(rows[0].status, 'pendente');       // sem cleaning_status ainda
  assert.equal(rows[0].sameDayCheckin, false);
});

test('reserva NÃO confirmada não gera turnover', () => {
  addResv('r1', 'p1', '2026-08-15', '2026-08-20', 'solicitada');
  addResv('r2', 'p1', '2026-08-15', '2026-08-20', 'cancelada');
  assert.equal(listTurnovers(db, '2026-08-01', '2026-08-31').length, 0);
});

test('checkout fora da janela é ignorado', () => {
  addResv('r1', 'p1', '2026-07-01', '2026-07-05');
  assert.equal(listTurnovers(db, '2026-08-01', '2026-08-31').length, 0);
});

test('detecta entrada no mesmo dia (turnover urgente)', () => {
  addResv('r1', 'p1', '2026-08-15', '2026-08-20');   // sai dia 20
  addResv('r2', 'p1', '2026-08-20', '2026-08-25');   // entra dia 20 no MESMO flat
  addResv('r3', 'p2', '2026-08-18', '2026-08-20');   // sai dia 20 em OUTRO flat (sem entrada)
  const rows = listTurnovers(db, '2026-08-07', '2026-09-06');
  const byId = Object.fromEntries(rows.map((r) => [r.reservation_id, r]));
  assert.equal(byId.r1.sameDayCheckin, true);        // p1 tem entrada no dia 20
  assert.equal(byId.r3.sameDayCheckin, false);       // p2 não tem
});

test('upsert cria e depois atualiza o status; listTurnovers reflete', () => {
  addResv('r1', 'p1', '2026-08-15', '2026-08-20', 'confirmada', 'Ana', '21999990000');
  upsertCleaning(db, 'r1', { status: 'concluida', assignee: 'Maria', notes: 'trocar enxoval' });
  let r = listTurnovers(db, '2026-08-07', '2026-09-06')[0];
  assert.equal(r.status, 'concluida');
  assert.equal(r.assignee, 'Maria');
  assert.equal(r.notes, 'trocar enxoval');
  // volta a pendente
  upsertCleaning(db, 'r1', { status: 'pendente', assignee: 'Maria', notes: '' });
  r = listTurnovers(db, '2026-08-07', '2026-09-06')[0];
  assert.equal(r.status, 'pendente');
  assert.equal(r.notes, '');
});

test('upsert sanea status inválido para pendente', () => {
  addResv('r1', 'p1', '2026-08-15', '2026-08-20');
  const st = upsertCleaning(db, 'r1', { status: 'xpto', assignee: '', notes: '' });
  assert.equal(st, 'pendente');
});
