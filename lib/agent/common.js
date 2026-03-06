import { ValidationError, UnauthorizedError } from '../errors/errorHandler';
import Device from '../../models/Device';

const CATEGORY_MAP = new Map([
  ['official', 'Official'],
  ['general', 'General'],
  ['namaz', 'Namaz'],
  ['pending', 'General'],
  ['personal break', 'General'],
  ['others', 'General'],
  ['other', 'General']
]);

// Breaks with these reasons are shown/counted as Official on frontend (agent still sends General)
const OFFICIAL_BY_REASON = [
  'internet disconnection (auto-detected)',
  'system power off / restart (auto-detected)'
];

export function getEffectiveBreakCategory(breakLog) {
  const reason = String(breakLog?.reason || '').trim().toLowerCase();
  const isOfficialByReason = OFFICIAL_BY_REASON.some((r) => reason.includes(r));
  if (isOfficialByReason) return 'Official';
  const raw = String(breakLog?.category || '').trim().toLowerCase();
  return CATEGORY_MAP.get(raw) || '';
}

export function normalizeBreakCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return CATEGORY_MAP.get(key) || '';
}

export function requiredString(v, field) {
  const out = String(v || '').trim();
  if (!out) throw new ValidationError(`${field} is required`);
  return out;
}

export async function verifyDevice(req, empCode, deviceId, opts = {}) {
  const headerToken = String(req.headers.get('x-device-token') || '').trim();
  const bodyToken = opts?.body ? String(opts.body.deviceToken || '').trim() : '';
  const token = headerToken || bodyToken;
  if (!token) throw new UnauthorizedError('Missing device token');
  const device = await Device.findOne({ empCode, deviceId }).lean().maxTimeMS(2000);
  if (!device || String(device.deviceToken) !== token) {
    throw new UnauthorizedError('Invalid device credentials');
  }
  return device;
}
