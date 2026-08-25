import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ENC_PREFIX = 'enc:v1:';

const SECRET_NAMES = ['BANK_DETAILS_ENCRYPTION_KEY', 'BANK_DETAILS_SECRET'];

/** Dynamic lookup so Turbopack cannot inline an empty string at compile time. */
function readEnvVar(name) {
  try {
    const value = process.env[String(name)];
    return value && String(value).trim() ? String(value).trim() : '';
  } catch {
    return '';
  }
}

function parseEnvFile(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(
      /^(BANK_DETAILS_ENCRYPTION_KEY|BANK_DETAILS_SECRET)\s*=\s*(.*)$/
    );
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return '';
}

/**
 * Walk up from cwd (and common Next roots) to find .env / .env.local.
 * Encrypted bank fields cannot be shown without this key.
 */
function readSecretFromEnvFiles() {
  const startDirs = [process.cwd()];
  // Next sometimes runs with a nested cwd; also try this file's project roots via cwd parents.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    startDirs.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const seen = new Set();
  for (const start of startDirs) {
    if (!start || seen.has(start)) continue;
    seen.add(start);
    for (const file of ['.env.local', '.env']) {
      try {
        const envPath = path.join(start, file);
        if (!fs.existsSync(envPath)) continue;
        const value = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
        if (value) return value;
      } catch {
        // ignore
      }
    }
  }
  return '';
}

let warnedMissingKey = false;

function getSecret() {
  for (const name of SECRET_NAMES) {
    const fromEnv = readEnvVar(name);
    if (fromEnv) return fromEnv;
  }
  const fromFile = readSecretFromEnvFiles();
  if (fromFile) return fromFile;

  if (!warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      '[bankDetailsCrypto] BANK_DETAILS_ENCRYPTION_KEY not found in process.env or .env — encrypted bank details cannot be decrypted'
    );
  }
  return '';
}

function getEncryptionKey() {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function normalizeBankDetailsInput(bankDetails) {
  const details = bankDetails || {};
  return {
    bankName: String(details.bankName || '').trim(),
    accountTitle: String(details.accountTitle || '').trim(),
    accountNumber: String(details.accountNumber || '').trim(),
    iban: String(details.iban || '').replace(/\s+/g, '').toUpperCase(),
  };
}

export function hasAnyBankDetails(bankDetails) {
  if (!bankDetails) return false;
  return Boolean(
    bankDetails.bankName ||
      bankDetails.accountTitle ||
      bankDetails.accountNumber ||
      bankDetails.iban
  );
}

function encryptValue(value) {
  if (!value) return '';
  if (String(value).startsWith(ENC_PREFIX)) return String(value);

  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      'Bank details encryption key is missing. Set BANK_DETAILS_ENCRYPTION_KEY or BANK_DETAILS_SECRET in .env and restart the server.'
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptValue(value) {
  if (!value) return '';
  const str = String(value);
  if (!str.startsWith(ENC_PREFIX)) return str;

  const key = getEncryptionKey();
  if (!key) return '';

  try {
    const payload = Buffer.from(str.slice(ENC_PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function encryptBankDetails(bankDetails) {
  const details = normalizeBankDetailsInput(bankDetails);
  if (!hasAnyBankDetails(details)) return null;

  return {
    bankName: encryptValue(details.bankName),
    accountTitle: encryptValue(details.accountTitle),
    accountNumber: encryptValue(details.accountNumber),
    iban: encryptValue(details.iban),
  };
}

export function decryptBankDetails(bankDetails) {
  if (!bankDetails || typeof bankDetails !== 'object') return null;
  const raw =
    typeof bankDetails.toObject === 'function' ? bankDetails.toObject() : { ...bankDetails };
  const plain = {
    bankName: decryptValue(raw.bankName),
    accountTitle: decryptValue(raw.accountTitle),
    accountNumber: decryptValue(raw.accountNumber),
    iban: decryptValue(raw.iban),
  };
  return hasAnyBankDetails(plain) ? plain : null;
}

/** For diagnostics only — never returns the secret. */
export function isBankEncryptionKeyConfigured() {
  return Boolean(getSecret());
}
