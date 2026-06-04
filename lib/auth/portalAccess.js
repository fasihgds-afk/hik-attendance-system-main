import { connectDB } from '../db';
import Employee from '../../models/Employee';
import { ForbiddenError } from '../errors/errorHandler';

/** Missing field = enabled (existing employees before migration). */
export function isPortalEnabled(employee) {
  if (!employee) return false;
  return employee.portalEnabled !== false;
}

/**
 * Ensure employee may use the employee portal. Throws ForbiddenError code PORTAL_DISABLED.
 */
export async function assertEmployeePortalEnabled(empCode) {
  const code = String(empCode || '').trim();
  if (!code) {
    throw new ForbiddenError('Employee portal access is disabled. Contact HR.');
  }

  await connectDB();
  const employee = await Employee.findOne({ empCode: code })
    .select('portalEnabled')
    .lean()
    .maxTimeMS(1500);

  if (!employee || !isPortalEnabled(employee)) {
    throw new ForbiddenError('Employee portal access is disabled. Contact HR.');
  }
}
