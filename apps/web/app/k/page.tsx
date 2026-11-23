'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KitchenIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/k/breakfast');
  }, [router]);
  return null;
}
