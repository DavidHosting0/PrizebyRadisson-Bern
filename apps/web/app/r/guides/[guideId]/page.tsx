'use client';

import { useParams } from 'next/navigation';
import { GuideReader } from '@/components/guides/GuideReader';

export default function ReceptionGuideDetailPage() {
  const params = useParams();
  const guideId = params.guideId as string;
  return <GuideReader guideId={guideId} />;
}
