import { requirePermission, requireAuth } from '../../../../../lib/auth/requireAuth';
import { hasPermission } from '../../../../../lib/auth/permissions';
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import { decryptBankDetails, isBankEncryptionKeyConfigured } from '../../../../../lib/security/bankDetailsCrypto';
import { NextResponse } from 'next/server';
import { mergeActiveFilter } from '../../../../../lib/employees/activeFilter';

function maskAccountNumber(value = '') {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.length <= 4) return raw;
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

function maskIban(value = '') {
  const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (!raw) return '';
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}${'*'.repeat(Math.max(0, raw.length - 8))}${raw.slice(-4)}`;
}

/**
 * GET /api/hr/employees/bank-details?empCode=XXXX
 * Single-employee decrypted bank details for HR Manage form.
 * Allowed for employees.view OR bankDetails.view (ADMIN always).
 */
export async function GET(req) {
  try {
    const { user } = await requireAuth();
    const role = String(user.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const canEmployees = hasPermission(user, 'employees', 'view');
    const canBank = hasPermission(user, 'bankDetails', 'view');
    if (role === 'HR' && !canEmployees && !canBank) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const empCode = String(searchParams.get('empCode') || '').trim();
    if (!empCode) {
      return NextResponse.json({ error: 'empCode is required' }, { status: 400 });
    }

    await connectDB();
    const emp = await Employee.findOne(mergeActiveFilter({ empCode }))
      .select('empCode bankDetails')
      .lean()
      .maxTimeMS(4000);

    if (!emp) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const raw = emp.bankDetails;
    const details = decryptBankDetails(raw);

    if (raw && !details) {
      console.warn('[bank-details] Stored bankDetails present but decrypt empty', {
        empCode,
        keyConfigured: isBankEncryptionKeyConfigured(),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        empCode: emp.empCode,
        bankDetails: details || {
          bankName: '',
          accountTitle: '',
          accountNumber: '',
          iban: '',
        },
      },
    });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED' || err?.code === 'UNAUTHORIZED_HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch bank details' },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const { user } = await requirePermission('bankDetails', 'view');

    const body = await req.json().catch(() => ({}));
    const empCodes = Array.isArray(body?.empCodes) ? body.empCodes : [];
    const mask = body?.mask !== false;
    if (!mask && !hasPermission(user, 'bankDetails', 'export')) {
      return NextResponse.json(
        { error: 'Missing permission: bankDetails.export' },
        { status: 403 }
      );
    }

    if (empCodes.length === 0) {
      return NextResponse.json({ items: [] });
    }

    await connectDB();

    const employees = await Employee.find({ empCode: { $in: empCodes } })
      .select('empCode bankDetails')
      .lean()
      .maxTimeMS(4000);

    const items = employees.map((emp) => {
      const details = decryptBankDetails(emp.bankDetails) || {};
      const accountNumber = mask
        ? maskAccountNumber(details.accountNumber || '')
        : details.accountNumber || '';
      const iban = mask ? maskIban(details.iban || '') : details.iban || '';
      return {
        empCode: emp.empCode,
        bankName: details.bankName || '',
        accountTitle: details.accountTitle || '',
        accountNumber,
        iban,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err?.code === 'FORBIDDEN_PERMISSION') {
      return NextResponse.json({ error: err.message || 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch bank details' },
      { status: 500 }
    );
  }
}
