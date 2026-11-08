import 'server-only';
import { PackageError, type BoothPrinterMode } from './package-contract';

export function getBoothPrinterMode(): BoothPrinterMode {
  if (process.env.NODE_ENV === 'production') return 'disabled';
  const mode = process.env.BOOTH_PRINTER_MODE;
  return mode === 'simulated' || mode === 'instax-development' ? mode : 'disabled';
}

export function requireBoothPrinterMode() {
  const mode = getBoothPrinterMode();
  if (mode === 'disabled') throw new PackageError('qualification_required');
  return mode;
}

/** Settlement uses the run pin after configuration changes, without authorizing another send. */
export function requireQualifiedPrinterEvidence(
  kind: string,
  evidence: { source: string; evidenceVersion: string },
  runPolicy: { mode: BoothPrinterMode; evidenceVersion: string }
) {
  if (process.env.NODE_ENV === 'production' || runPolicy.mode === 'disabled')
    throw new PackageError('qualification_required');
  const physical = runPolicy.mode === 'instax-development';
  if (
    runPolicy.evidenceVersion !== (physical ? 'instax-fi033-0102-dev-v1' : 'simulator-v1') ||
    evidence.source !== (physical ? 'instax-mini-link3-v1' : 'simulator') ||
    evidence.evidenceVersion !== runPolicy.evidenceVersion ||
    ![
      'definitely_not_sent',
      'command_accepted',
      'full_ejection_confirmed',
      'outcome_unknown',
      'connection_changed',
      'ready_for_new_job',
      ...(physical ? [] : ['no_film_rejected']),
    ].includes(kind)
  )
    throw new PackageError('qualification_required');
}
