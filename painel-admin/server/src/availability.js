/**
 * Uma estadia [checkin, checkout) está disponível se NÃO colide com:
 *  - bloqueios do imóvel (start_date..end_date, fim inclusivo)
 *  - reservas já confirmadas (checkin..checkout, meio-aberto)
 * Comparação lexicográfica de datas yyyy-mm-dd equivale à comparação temporal.
 * Recebe o `db` como parâmetro para ser testável isoladamente.
 */
export function isAvailable(db, propertyId, checkin, checkout, ignoreReservationId = null) {
  const blk = db.prepare(
    'SELECT 1 FROM blocks WHERE property_id = ? AND start_date < ? AND end_date >= ? LIMIT 1',
  ).get(propertyId, checkout, checkin);
  if (blk) return false;
  const resv = db.prepare(
    `SELECT 1 FROM reservations WHERE property_id = ? AND status = 'confirmada'
     AND checkin < ? AND checkout > ? AND id != ? LIMIT 1`,
  ).get(propertyId, checkout, checkin, ignoreReservationId || '');
  return !resv;
}
