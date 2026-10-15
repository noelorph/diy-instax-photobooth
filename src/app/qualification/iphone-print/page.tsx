import { notFound } from 'next/navigation';
import { QualificationClient } from '@/features/qualification/QualificationClient';

export default function IPhonePrintQualificationPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <QualificationClient />;
}
