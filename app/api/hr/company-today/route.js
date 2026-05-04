import { NextResponse } from 'next/server';
import { requireHR } from '../../../../lib/auth/requireAuth';
import { getCompanyTodayYmd } from '../../../../lib/time/companyToday.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — company calendar date YYYY-MM-DD (for HR forms defaulting “effective from”). */
export async function GET() {
  try {
    await requireHR();
    return NextResponse.json({ todayYmd: getCompanyTodayYmd() });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
