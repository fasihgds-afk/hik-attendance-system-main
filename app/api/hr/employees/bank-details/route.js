import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { hasPermission } from '../../../../../lib/auth/permissions';
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import { decryptBankDetails } from '../../../../../lib/security/bankDetailsCrypto';
import { NextResponse } from 'next/server';

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
      const accountNumber = mask ? maskAccountNumber(details.accountNumber || '') : (details.accountNumber || '');
      const iban = mask ? maskIban(details.iban || '') : (details.iban || '');
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
