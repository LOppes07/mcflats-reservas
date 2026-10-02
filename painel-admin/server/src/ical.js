import { uid } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
const toIcsDate = (isoDate) => isoDate.replace(/-/g, ''); // yyyy-mm-dd -> yyyymmdd
const fromIcsDate = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
export const addDays = (isoDate, days) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * Gera um feed iCal (.ics) a partir de eventos { start, end (inclusivo), summary }.
 * Em iCal, DTEND de evento "dia inteiro" é EXCLUSIVO — por isso end + 1 dia.
 */
export function buildIcs(calName, events) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MC Flats//Reservas//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${calName}`];
  for (const ev of events) {
    L.push('BEGIN:VEVENT');
    L.push(`UID:${ev.uid || uid()}@mcflats`);
    L.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.start)}`);
    L.push(`DTEND;VALUE=DATE:${toIcsDate(addDays(ev.end, 1))}`);
    L.push(`SUMMARY:${(ev.summary || 'Indisponível').replace(/[\r\n,;]/g, ' ')}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

/**
 * Faz o parse de um feed iCal e devolve períodos ocupados { start, end (inclusivo) }.
 * Aceita datas "dia inteiro" (VALUE=DATE) e datetime (pega só a parte da data).
 */
export function parseIcs(text) {
  const out = [];
  const chunks = String(text).split('BEGIN:VEVENT').slice(1);
  for (const c of chunks) {
    const s = /DTSTART[^:\n]*:(\d{8})/.exec(c);
    const e = /DTEND[^:\n]*:(\d{8})/.exec(c);
    if (!s) continue;
    const start = fromIcsDate(s[1]);
    // DTEND exclusivo -> fim inclusivo (dia anterior). Sem DTEND: 1 noite.
    const end = e ? addDays(fromIcsDate(e[1]), -1) : start;
    if (end >= start) out.push({ start, end });
  }
  return out;
}

/**
 * Sincroniza todos os feeds externos: baixa cada um, faz parse e regrava os
 * bloqueios daquele feed (source = 'ical:<feedId>'), sem tocar nos bloqueios manuais.
 */
export async function syncAllFeeds(db) {
  const feeds = db.prepare('SELECT * FROM ical_feeds').all();
  let total = 0;
  for (const f of feeds) {
    const source = 'ical:' + f.id;
    try {
      const res = await fetch(f.url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const events = parseIcs(await res.text());
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM blocks WHERE source = ?').run(source);
        const ins = db.prepare('INSERT INTO blocks (id, property_id, start_date, end_date, reason, source) VALUES (?,?,?,?,?,?)');
        for (const ev of events) ins.run(uid(), f.property_id, ev.start, ev.end, f.label || 'Importado (iCal)', source);
        db.exec('COMMIT');
      } catch (err) { db.exec('ROLLBACK'); throw err; }
      db.prepare("UPDATE ical_feeds SET last_sync = datetime('now'), last_status = ? WHERE id = ?").run(`ok — ${events.length} período(s)`, f.id);
      total += events.length;
    } catch (err) {
      db.prepare("UPDATE ical_feeds SET last_sync = datetime('now'), last_status = ? WHERE id = ?").run('erro: ' + String(err.message || err).slice(0, 80), f.id);
    }
  }
  return total;
}
