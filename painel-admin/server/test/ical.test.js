import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, parseIcs, addDays } from '../src/ical.js';

test('addDays soma/subtrai dias corretamente (inclui virada de mês)', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('buildIcs gera VEVENT com DTEND exclusivo (fim + 1 dia)', () => {
  const ics = buildIcs('Flat 1', [{ uid: 'a', start: '2026-09-10', end: '2026-09-12', summary: 'Reservado' }]);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260910/);
  assert.match(ics, /DTEND;VALUE=DATE:20260913/); // 12 + 1 = 13 (exclusivo)
  assert.match(ics, /END:VCALENDAR/);
});

test('parseIcs converte DTEND exclusivo para fim inclusivo', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261005', 'SUMMARY:Airbnb (Not available)',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const [ev] = parseIcs(ics);
  assert.equal(ev.start, '2026-10-01');
  assert.equal(ev.end, '2026-10-04'); // 05 exclusivo -> 04 inclusivo
});

test('round-trip: buildIcs -> parseIcs preserva o período', () => {
  const ics = buildIcs('Flat', [{ uid: 'x', start: '2026-12-20', end: '2026-12-27', summary: 'Bloqueado' }]);
  const [ev] = parseIcs(ics);
  assert.equal(ev.start, '2026-12-20');
  assert.equal(ev.end, '2026-12-27');
});

test('parseIcs ignora datetime (pega só a data)', () => {
  const ics = 'BEGIN:VEVENT\r\nDTSTART:20260910T140000Z\r\nDTEND:20260911T100000Z\r\nEND:VEVENT';
  const [ev] = parseIcs(ics);
  assert.equal(ev.start, '2026-09-10');
});
