import crypto from 'crypto';

const ENC_PREFIX = 'enc:v1:';

function getEncryptionKey() {
  const secret =
    process.env.BANK_DETAILS_ENCRYPTION_KEY ||
    process.env.BANK_DETAILS_SECRET ||
    '';
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
      'Bank details encryption key is missing. Set BANK_DETAILS_ENCRYPTION_KEY or BANK_DETAILS_SECRET.'
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
  const plain = {
    bankName: decryptValue(bankDetails.bankName),
    accountTitle: decryptValue(bankDetails.accountTitle),
    accountNumber: decryptValue(bankDetails.accountNumber),
    iban: decryptValue(bankDetails.iban),
  };
  return hasAnyBankDetails(plain) ? plain : null;
}
