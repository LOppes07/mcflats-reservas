import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, overlapNights, daysBetween } from '../src/reports.js';

const props = [
  { id: 'a', name: 'Flat A', hood: 'ipanema', price: 500 },
  { id: 'b', name: 'Flat B', hood: 'leblon', price: 1000 },
];

test('daysBetween conta noites corretamente', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-11'), 10);
});

test('overlapNights recorta a estadia à janela', () => {
  // estadia 05→15 (10 noites) numa janela 01→10 (toEx=11) → noites 05..10 = 6
  assert.equal(overlapNights('2026-09-05', '2026-09-15', '2026-09-01', '2026-09-11'), 6);
  // fora da janela
  assert.equal(overlapNights('2026-10-01', '2026-10-05', '2026-09-01', '2026-09-11'), 0);
});

test('ocupação e ADR de um mês (setembro, 30 dias)', () => {
  // Flat A: reserva 10 noites a 500 = 5000. Flat B: sem reservas.
  const r = computeReport({
    props: undefined, properties: props,
    confirmed: [{ property_id: 'a', checkin: '2026-09-01', checkout: '2026-09-11', price: 500 }],
    from: '2026-09-01', to: '2026-09-30',
  });
  assert.equal(r.windowNights, 30);
  assert.equal(r.totals.availNights, 60);   // 2 imóveis × 30
  assert.equal(r.totals.occNights, 10);
  assert.equal(r.totals.revenue, 5000);
  assert.equal(r.totals.adr, 500);          // 5000 / 10
  assert.equal(Math.round(r.totals.occupancy * 1000) / 1000, 0.167); // 10/60
  assert.equal(r.totals.revpar, 83);        // 5000 / 60
  // Flat A no topo (mais receita)
  assert.equal(r.properties[0].id, 'a');
  assert.equal(r.properties[0].occupancy, 10 / 30);
});

test('reserva de imóvel excluído/rascunho não entra no denominador', () => {
  const r = computeReport({
    properties: props,
    confirmed: [{ property_id: 'zzz', checkin: '2026-09-01', checkout: '2026-09-05', price: 900 }],
    from: '2026-09-01', to: '2026-09-30',
  });
  assert.equal(r.totals.occNights, 0);
  assert.equal(r.totals.revenue, 0);
});

test('funil calcula conversão', () => {
  const r = computeReport({
    properties: props, confirmed: [], from: '2026-09-01', to: '2026-09-30',
    funnel: [{ status: 'solicitada' }, { status: 'confirmada' }, { status: 'confirmada' }, { status: 'cancelada' }],
  });
  assert.equal(r.funnel.requests, 4);
  assert.equal(r.funnel.confirmada, 2);
  assert.equal(r.funnel.conversion, 0.5);
});
