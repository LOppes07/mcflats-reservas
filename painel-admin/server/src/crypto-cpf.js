// Criptografia de CPF em repouso (LGPD, dado pessoal sensível).
// AES-256-GCM com chave em CPF_ENC_KEY (32 bytes em hex ou base64). A chave NUNCA muda
// depois de valores gravados — trocá-la torna os CPFs existentes indecifráveis.
//
// Formato armazenado: "enc:<iv_b64>:<tag_b64>:<ciphertext_b64>".
// Valores legados em texto claro (sem o prefixo "enc:") são lidos como estão (passthrough),
// então dá pra ligar a criptografia sem migração e sem quebrar o que já existe.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:';

function loadKey() {
  const raw = process.env.CPF_ENC_KEY;
  if (!raw) return null;
  let buf;
  try { buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'); }
  catch { return null; }
  return buf.length === 32 ? buf : null;
}

const KEY = loadKey();

/** true se a criptografia está ativa (chave válida presente). */
export function cpfEncryptionEnabled() {
  return KEY !== null;
}

/** Cifra o CPF (string de dígitos). Sem chave, devolve o valor como veio (dev/fallback). */
export function encryptCpf(plain) {
  const v = String(plain || '');
  if (!v || !KEY) return v;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(v, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

// Aliases genéricos: o mesmo AES-256-GCM serve para qualquer segredo em repouso (ex.: dados de cartão).
export const encryptSecret = encryptCpf;
export const decryptSecret = decryptCpf;

/** Decifra. Aceita valor legado em claro (passthrough). Em falha, devolve null. */
export function decryptCpf(stored) {
  const v = String(stored || '');
  if (!v) return '';
  if (!v.startsWith(PREFIX)) return v; // legado em texto claro
  if (!KEY) return null;               // cifrado mas sem chave = não dá pra ler
  try {
    const [, ivB64, tagB64, ctB64] = v.split(':');
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
