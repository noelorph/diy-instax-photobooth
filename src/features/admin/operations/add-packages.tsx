'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFeedback } from '@/components/shared/form-feedback';
import { addPackagesSchema } from '@/lib/operations/package-purchase-schema';
import {
  MAX_TOTAL_PACKAGES,
  type PackageCounts,
  type PackageOperationResult,
} from '@/lib/operations/package-contract';
import type { z } from 'zod';
import styles from './panel.module.css';

type Purchase = z.infer<typeof addPackagesSchema>;
type Result = PackageOperationResult<PackageCounts & { entryId: string }>;
export function AddPackages({
  eventId,
  adminUserId,
  eligible,
  counts,
  onCounts,
}: {
  eventId: string;
  adminUserId: string;
  eligible: boolean;
  counts: PackageCounts;
  onCounts: (counts: PackageCounts) => void;
}) {
  const router = useRouter();
  const storageKey = `film-package-purchase:${eventId}:${adminUserId}`;
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [packages, setPackages] = useState('1');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Purchase | null>(null);
  const [receipt, setReceipt] = useState<Result['receipt'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (!saved) return;
        const purchase = addPackagesSchema.parse(JSON.parse(saved));
        setPending(purchase);
        setPackages(String(purchase.packages));
        setNote(purchase.clientRequestNote);
        setOpen(true);
        setError(
          'We could not confirm whether the Film Packages were added. Retry to check the original request.'
        );
      } catch {
        setOpen(true);
        setError(
          'Saved request details could not be read. Recover the original request before making another purchase.'
        );
        submitting.current = true;
      } finally {
        setReady(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  async function refreshCounts() {
    const response = await fetch(`/api/admin/events/${eventId}/booth/state`, { cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        'The purchase is recorded. Current totals are unavailable; retry to refresh.'
      );
    const state = await response.json();
    if (!state.counts) throw new Error('Current totals are unavailable; retry to refresh.');
    onCounts(state.counts);
    setCurrent(true);
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    let purchase = pending;
    try {
      if (receipt) {
        await refreshCounts();
        return;
      }
      if (!purchase) {
        const parsed = addPackagesSchema.safeParse({
          operationId: crypto.randomUUID(),
          packages: Number(packages),
          clientRequestNote: note,
        });
        if (
          !parsed.success ||
          Number(packages) + counts.originalPackages + counts.additionalPackages >
            MAX_TOTAL_PACKAGES
        ) {
          setError(
            'Enter a positive whole number of Film Packages within the booking limit and a Client request note.'
          );
          return;
        }
        purchase = parsed.data;
        // Persist before sending so a reload cannot create a second purchase identity.
        sessionStorage.setItem(storageKey, JSON.stringify(purchase));
        setPending(purchase);
      } else {
        const lookup = await fetch(
          `/api/admin/events/${eventId}/operations/${purchase.operationId}`,
          { cache: 'no-store' }
        );
        if (!lookup.ok)
          throw new Error(
            'Unable to check the original request. Retry when your Admin access and connection are available.'
          );
        const recovered = await lookup.json();
        if (recovered.receipt) {
          if (
            recovered.receipt.operationId !== purchase.operationId ||
            recovered.receipt.kind !== 'add_packages'
          )
            throw new Error('The original request needs review before another purchase.');
          setReceipt(recovered.receipt);
          await refreshCounts();
          return;
        }
      }
      const response = await fetch(`/api/admin/events/${eventId}/film-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(purchase),
      });
      const result = await response.json();
      if (!response.ok) {
        if ([400, 409].includes(response.status) && result.code !== 'operation_conflict') {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          throw new Error(
            'The purchase was not recorded. Reload current state and review the package count and Client request note.'
          );
        }
        throw new Error(
          'We could not confirm whether the Film Packages were added. Your request details have been kept. Retry to check its result.'
        );
      }
      const committed = result as Result;
      if (
        committed.receipt?.operationId !== purchase.operationId ||
        committed.receipt.kind !== 'add_packages'
      )
        throw new Error('The original request needs review before another purchase.');
      setReceipt(committed.receipt);
      await refreshCounts();
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : 'We could not confirm whether the Film Packages were added. Your request details have been kept. Retry to check its result.'
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const valid =
    Number.isInteger(Number(packages)) &&
    Number(packages) > 0 &&
    Number(packages) + counts.originalPackages + counts.additionalPackages <= MAX_TOTAL_PACKAGES;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy && !pending) setOpen(value);
      }}
    >
      {eligible && (
        <Dialog.Trigger asChild>
          <Button variant="secondary" disabled={!ready}>
            Add Film Packages
          </Button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title>Add Film Packages</Dialog.Title>
          <Dialog.Description>
            Each Film Package adds 10 booked prints. Loading the printer is separate and Booth Mode
            will not resume automatically.
          </Dialog.Description>
          {receipt ? (
            <>
              <FormFeedback kind="status">Film Packages added.</FormFeedback>
              <p>Reference {receipt.result.entryId}</p>
            </>
          ) : (
            <>
              <p>
                Current: {counts.originalPackages + counts.additionalPackages} packages ·{' '}
                {counts.totalBookedPrints} prints
              </p>
              <label>
                Additional Film Packages
                <Input
                  type="number"
                  aria-invalid={!valid}
                  min="1"
                  step="1"
                  max={MAX_TOTAL_PACKAGES - counts.originalPackages - counts.additionalPackages}
                  value={packages}
                  disabled={busy || !!pending}
                  onChange={(e) => setPackages(e.target.value)}
                />
              </label>
              <label>
                Client request note
                <Input
                  value={note}
                  disabled={busy || !!pending}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {valid && !pending && (
                <p>
                  New total:{' '}
                  {counts.originalPackages + counts.additionalPackages + Number(packages)} packages
                  · {counts.totalBookedPrints + Number(packages) * 10} prints
                </p>
              )}
            </>
          )}
          {error && (
            <FormFeedback kind="error">
              {error}{' '}
              <Button variant="quiet" onClick={() => router.refresh()}>
                Reload current state
              </Button>
            </FormFeedback>
          )}
          {busy && <p role="status">Checking purchase…</p>}
          <div className={styles.actions}>
            {receipt && current ? (
              <Button
                onClick={() => {
                  sessionStorage.removeItem(storageKey);
                  setPending(null);
                  setReceipt(null);
                  setPackages('1');
                  setNote('');
                  setCurrent(false);
                  setError('');
                  setOpen(false);
                }}
              >
                Done
              </Button>
            ) : (
              <Button disabled={busy || (!pending && (!valid || !note.trim()))} onClick={submit}>
                {pending || receipt ? 'Retry request' : 'Add Film Packages'}
              </Button>
            )}
            {!pending && !receipt && (
              <Dialog.Close asChild>
                <Button variant="quiet" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
