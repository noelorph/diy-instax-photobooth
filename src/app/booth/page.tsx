import { Suspense } from 'react';
import { BoothEntry } from '@/features/booth/entry';
import { BoothPaused } from '@/features/booth/booth-client';
export default function BoothPage() {
  return (
    <Suspense fallback={<BoothPaused />}>
      <BoothEntry />
    </Suspense>
  );
}
