import { connection } from 'next/server';
import { requireSimulator } from '@/lib/operations/printer-gate';
import { BoothClient, BoothPaused } from './booth-client';
export async function BoothEntry() {
  await connection();
  try {
    requireSimulator();
  } catch {
    return <BoothPaused />;
  }
  return <BoothClient />;
}
