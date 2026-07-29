// app/api/auth/login/route.js
import { connectDB } from '../../../../lib/db';
import User from '../../../../models/User';
import Employee from '../../../../models/Employee';
import bcrypt from 'bcryptjs';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../../../lib/errors/errorHandler';
import { isPortalEnabled } from '../../../../lib/auth/portalAccess';
import { isEmployeeActive } from '../../../../lib/employees/activeFilter';
import { rateLimiters } from '../../../../lib/middleware/rateLimit';
import { parseHrLogin, parseEmployeeLogin } from '../../../../lib/validations/login';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const rateLimitResponse = await rateLimiters.auth(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Invalid request body');
    }

    const { role } = body;
    if (typeof role !== 'string' || !role.trim()) {
      throw new ValidationError('role is required');
    }

    // HR login
    if (role === 'HR') {
      const parsed = parseHrLogin({ email: body.email, password: body.password });
      if (!parsed.ok) {
        throw new ValidationError(parsed.error);
      }
      const { email, password } = parsed.data;

      // OPTIMIZATION: Select only required fields, add timeout
      const user = await User.findOne({ email, role: 'HR' })
        .select('passwordHash role')
        .lean()
        .maxTimeMS(2000);
      if (!user) {
        throw new UnauthorizedError('Invalid HR credentials');
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedError('Invalid HR credentials');
      }

      return successResponse(
        { role: 'HR' },
        'HR login successful',
        HTTP_STATUS.OK
      );
    }

    if (role === 'EMPLOYEE') {
      const parsed = parseEmployeeLogin({ empCode: body.empCode });
      if (!parsed.ok) {
        throw new ValidationError(parsed.error);
      }
      const { empCode } = parsed.data;

      const employee = await Employee.findOne({ empCode })
        .select('empCode name portalEnabled status')
        .lean()
        .maxTimeMS(1500);

      if (!employee) {
        throw new UnauthorizedError('Employee not found');
      }

      if (!isEmployeeActive(employee)) {
        throw new ForbiddenError(
          'This employee account has been deactivated. Please contact HR.'
        );
      }

      if (!isPortalEnabled(employee)) {
        throw new ForbiddenError(
          'Your employee portal access is disabled. Please contact HR.'
        );
      }

      return successResponse(
        {
          role: 'EMPLOYEE',
          empCode: employee.empCode,
          name: employee.name,
        },
        'Employee login successful',
        HTTP_STATUS.OK
      );
    }

    throw new ValidationError('Invalid role');
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
