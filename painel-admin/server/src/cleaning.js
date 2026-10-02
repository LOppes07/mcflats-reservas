// Limpeza (turnovers): tarefas DERIVADAS do checkout de cada reserva confirmada.
// Query pura (recebe db) para ser testável isoladamente. cleaning_status guarda só
// o estado editável de cada turnover, com a reserva como chave.

export function listTurnovers(db, from, to) {
  const rows = db.prepare(
    `SELECT r.id AS reservation_id, r.property_id, p.name AS property_name, p.hood,
            r.checkout AS date, r.checkin, r.name AS guest_name, r.phone AS guest_phone,
            COALESCE(cs.status, 'pendente') AS status,
            COALESCE(cs.assignee, '') AS assignee,
            COALESCE(cs.notes, '') AS notes
       FROM reservations r
       LEFT JOIN properties p ON p.id = r.property_id
       LEFT JOIN cleaning_status cs ON cs.reservation_id = r.id
      WHERE r.status = 'confirmada' AND r.checkout BETWEEN ? AND ?
      ORDER BY r.checkout ASC, p.name ASC`,
  ).all(from, to);
  // Turnover de mesmo dia: outra reserva confirmada entra no imóvel na data do checkout.
  const nextIns = db.prepare(
    "SELECT DISTINCT property_id, checkin FROM reservations WHERE status = 'confirmada' AND checkin BETWEEN ? AND ?",
  ).all(from, to);
  const sameDay = new Set(nextIns.map((x) => x.property_id + '|' + x.checkin));
  for (const r of rows) r.sameDayCheckin = sameDay.has(r.property_id + '|' + r.date);
  return rows;
}

export function upsertCleaning(db, reservationId, { status, assignee, notes }) {
  const st = ['pendente', 'concluida'].includes(status) ? status : 'pendente';
  db.prepare(
    `INSERT INTO cleaning_status (reservation_id, status, assignee, notes, updated_at)
     VALUES (@id, @status, @assignee, @notes, datetime('now'))
     ON CONFLICT(reservation_id) DO UPDATE SET
       status = @status, assignee = @assignee, notes = @notes, updated_at = datetime('now')`,
  ).run({ id: reservationId, status: st, assignee: (assignee || '').toString().slice(0, 80), notes: (notes || '').toString().slice(0, 300) });
  return st;
}
