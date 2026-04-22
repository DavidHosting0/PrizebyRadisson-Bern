'use client';

import { LostFoundManager } from '@/components/lost-found/LostFoundManager';

export default function ReceptionMobileLostPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <LostFoundManager subtitle="Storage, guest handover, and new arrivals" />
    </div>
  );
}
