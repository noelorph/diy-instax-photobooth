import { Suspense } from 'react';
import { BoothEntry } from '@/features/booth/entry';
import { BoothPaused } from '@/features/booth/booth-client';
export default function BoothPage({ searchParams }: PageProps<'/booth'>) {
  return (
    <Suspense fallback={<BoothPaused />}>
      <BoothEntry searchParams={searchParams} />
    </Suspense>
  );
}
