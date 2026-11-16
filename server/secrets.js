// Encryption for secrets at rest (API keys) and hashing for PINs / session tokens.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getMeta, setMeta, db } from './db.js';

const DATA_DIR = process.env.DATA_DIR || '/data';

// Master key: MP_SECRET_KEY env (preferred, keep it in Unraid's masked variable) or a
// generated key file in the data volume with 0600 permissions.
function loadMasterKey() {
  const env = process.env.MP_SECRET_KEY;
  if (env) return crypto.createHash('sha256').update(env).digest();
  const file = path.join(DATA_DIR, '.secret-key');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn('[secrets] MP_SECRET_KEY not set; generated a key file in the data volume. Set MP_SECRET_KEY for stronger separation.');
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
}
const MASTER = loadMasterKey();

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', MASTER, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', MASTER, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

export function setSecret(key, value) {
  if (value == null || value === '') db.prepare('DELETE FROM meta WHERE key=?').run(key);
  else setMeta(key, encrypt(value));
}
export function getSecret(key) {
  const v = getMeta(key);
  if (!v) return null;
  try { return decrypt(v); } catch { return null; } // master key changed
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pin), salt, 32);
  return `s1:${salt.toString('base64')}:${h.toString('base64')}`;
}
export function verifyPin(pin, stored) {
  if (!stored) return true;
  const [, salt, h] = stored.split(':');
  const got = crypto.scryptSync(String(pin ?? ''), Buffer.from(salt, 'base64'), 32);
  const want = Buffer.from(h, 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
