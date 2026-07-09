'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /register → full users management page */
export default function RegisterRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/hr/users');
  }, [router]);
  return null;
}
