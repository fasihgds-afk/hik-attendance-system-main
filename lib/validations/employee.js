// next-app/lib/validations/employee.js
import { z } from 'zod';

/**
 * Employee validation schemas
 */
const nullToUndef = (val) => (val === null || val === undefined) ? undefined : val;

export const employeeSchema = z.object({
  empCode: z.string()
    .min(1, 'Employee code is required')
    .max(20, 'Employee code must be 20 characters or less')
    .regex(/^[A-Z0-9]+$/i, 'Employee code must contain only letters and numbers'),
  name: z.preprocess(nullToUndef,
    z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').trim(),
  ),
  email: z.preprocess(nullToUndef,
    z.string().email('Invalid email format').optional().or(z.literal('')),
  ),
  monthlySalary: z.preprocess(
    (val) => (val === '' || val === null || val === undefined) ? undefined : Number(val),
    z.number().min(0, 'Salary must be positive').max(10000000, 'Salary exceeds maximum allowed').optional(),
  ),
  shift: z.preprocess(nullToUndef,
    z.string().max(24).optional().or(z.literal('')),
  ),
  shiftId: z.preprocess(nullToUndef,
    z.string().max(24).optional().or(z.literal('')),
  ),
  department: z.preprocess(nullToUndef,
    z.string().max(100, 'Department must be 100 characters or less').optional().or(z.literal('')),
  ),
  designation: z.preprocess(nullToUndef,
    z.string().max(100, 'Designation must be 100 characters or less').optional().or(z.literal('')),
  ),
  phoneNumber: z.preprocess(nullToUndef,
    z.string().max(20, 'Phone number must be 20 characters or less')
      .regex(/^[0-9+\-\s()]*$/, 'Invalid phone number format').optional().or(z.literal('')),
  ),
  cnic: z.preprocess(nullToUndef,
    z.string().max(20, 'CNIC must be 20 characters or less').optional().or(z.literal('')),
  ),
  saturdayGroup: z.preprocess(nullToUndef,
    z.enum(['A', 'B']).optional(),
  ),
  profileImageBase64: z.preprocess(nullToUndef,
    z.string().optional().or(z.literal('')),
  ),
  profileImageUrl: z.preprocess(nullToUndef,
    z.string().optional().or(z.literal('')),
  ),
});

export const employeeUpdateSchema = employeeSchema.partial();

/**
 * Validate employee data
 * @param {Object} data - Employee data to validate
 * @param {boolean} isUpdate - Whether this is an update (partial validation)
 * @returns {Object} Validation result
 */
export function validateEmployee(data, isUpdate = false) {
  try {
    const schema = isUpdate ? employeeUpdateSchema : employeeSchema;
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Zod uses 'issues' property, not 'errors'
      const issues = error.issues || error.errors || [];
      return {
        success: false,
        errors: issues.map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message || 'Validation error',
        })),
      };
    }
    throw error;
  }
}

