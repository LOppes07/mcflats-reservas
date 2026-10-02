// Validadores puros compartilhados (testáveis isoladamente).

/** Validação de CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCpf(v) {
  const c = String(v || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base) => {
    let s = 0;
    for (let i = 0; i < base; i++) s += Number(c[i]) * (base + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Data mínima de check-in: antecedência de `days` dias (padrão 1 = ~24h), no fuso do servidor. yyyy-mm-dd. */
export function minCheckinIso(now = Date.now(), days = 1) {
  const d = new Date(now + Math.max(0, days) * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * URL de rede segura para fetch externo (feeds iCal, fotos por URL).
 * Bloqueia esquemas não-http(s) e hosts internos/loopback/metadata (anti-SSRF).
 */
export function isSafeExternalUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') ||
    host === '0.0.0.0' || host === '::1' || host === '[::1]' ||
    host === '169.254.169.254' ||                      // metadata de nuvem
    /^127\./.test(host) ||                              // loopback
    /^10\./.test(host) ||                               // rede privada
    /^192\.168\./.test(host) ||                         // rede privada
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||          // rede privada 172.16-31
    /^169\.254\./.test(host) ||                         // link-local
    /^fe80:/i.test(host) || /^fc00:/i.test(host) || /^fd/i.test(host) // IPv6 link-local/ULA
  ) return false;
  return true;
}
