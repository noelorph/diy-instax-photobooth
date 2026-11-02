'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFeedback } from '@/components/shared/form-feedback';
import { addPackagesSchema } from '@/lib/operations/package-purchase-schema';
import {
  MAX_TOTAL_PACKAGES,
  type PackageCounts,
  type PackageOperationResult,
} from '@/lib/operations/package-contract';
import { z } from 'zod';
import { FormField } from '@/components/shared/form-field';
import styles from './panel.module.css';

type Purchase = z.infer<typeof addPackagesSchema>;
type Result = PackageOperationResult<PackageCounts & { entryId: string }>;
export function AddPackages({
  eventId,
  adminUserId,
  eligible,
  counts,
  onCounts,
  refreshAdmin,
}: {
  eventId: string;
  adminUserId: string;
  eligible: boolean;
  counts: PackageCounts;
  onCounts: (counts: PackageCounts) => void;
  refreshAdmin: () => void;
}) {
  const id = useId();
  const storageKey = `film-package-purchase:${eventId}:${adminUserId}`;
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [packages, setPackages] = useState('1');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Purchase | Pick<Purchase, 'operationId'> | null>(null);
  const [receipt, setReceipt] = useState<Result['receipt'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const submitting = useRef(false);
  const readSavedRequest = useCallback(() => {
    let saved: string | null;
    try {
      saved = sessionStorage.getItem(storageKey);
    } catch {
      setStorageBlocked(true);
      setOpen(true);
      setError(
        'Browser storage is unavailable. Restore storage access, then retry the saved request.'
      );
      return;
    }
    try {
      if (saved) {
        const value = JSON.parse(saved);
        const parsed = addPackagesSchema.safeParse(value);
        setOpen(true);
        if (!parsed.success) {
          if (!z.uuid().safeParse(value?.operationId).success) throw new Error();
          setPending({ operationId: value.operationId });
          setError(
            'Saved purchase details are damaged. Retry to check its receipt; the purchase will not be sent again.'
          );
        } else {
          setPending(parsed.data);
          setPackages(String(parsed.data.packages));
          setNote(parsed.data.clientRequestNote);
          setError(
            'We could not confirm whether the Film Packages were added. Retry to check the original request.'
          );
        }
      } else {
        setError('');
      }
      setStorageBlocked(false);
    } catch {
      setOpen(true);
      setStorageBlocked(true);
      setError(
        'Saved request data is damaged and its reference cannot be read. Restore the original saved request, then retry. Do not clear it or start another purchase while its outcome is unknown.'
      );
    }
  }, [storageKey]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPortalContainer(document.querySelector<HTMLElement>('.admin-shell'));
      readSavedRequest();
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [readSavedRequest]);
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
    if (submitting.current || storageBlocked) return;
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
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(purchase));
        } catch {
          throw new Error(
            'The purchase was not sent because browser storage is unavailable. Restore storage access and try again.'
          );
        }
        setPending(purchase);
      } else {
        const lookup = await fetch(
          `/api/admin/events/${eventId}/operations/${purchase.operationId}`,
          { cache: 'no-store', headers: { 'x-package-admin-id': adminUserId } }
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
      if (!('packages' in purchase))
        throw new Error(
          'No receipt is available yet. Restore the original saved purchase details and reload, or retry the receipt check. No new purchase has been sent.'
        );
      const response = await fetch(`/api/admin/events/${eventId}/film-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-package-admin-id': adminUserId },
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
  const maximum = MAX_TOTAL_PACKAGES - counts.originalPackages - counts.additionalPackages;
  const quantityError =
    packages.trim() === ''
      ? 'Enter the number of Film Packages to add.'
      : !Number.isInteger(Number(packages))
        ? 'Enter a whole number of Film Packages.'
        : Number(packages) < 1
          ? 'Enter at least one Film Package.'
          : Number(packages) > maximum
            ? `You can add at most ${maximum} Film Packages to this Event.`
            : undefined;
  const valid = !quantityError;
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
      <Dialog.Portal container={portalContainer}>
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
              <FormField
                id={`${id}-packages`}
                label="Additional Film Packages"
                error={quantityError}
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="number"
                    min="1"
                    step="1"
                    max={maximum}
                    value={packages}
                    disabled={busy || !!pending || storageBlocked}
                    onChange={(e) => setPackages(e.target.value)}
                  />
                )}
              </FormField>
              <label>
                Client request note
                <Input
                  value={note}
                  disabled={busy || !!pending || storageBlocked}
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
              <Button variant="quiet" onClick={refreshAdmin}>
                Reload current state
              </Button>
            </FormFeedback>
          )}
          {busy && <p role="status">Checking purchase…</p>}
          <div className={styles.actions}>
            {receipt && current ? (
              <Button
                onClick={() => {
                  try {
                    sessionStorage.removeItem(storageKey);
                  } catch {
                    setError(
                      'The purchase is recorded, but its saved reference could not be cleared. Restore browser storage access and select Done again.'
                    );
                    return;
                  }
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
            ) : storageBlocked ? (
              <Button onClick={readSavedRequest}>Retry saved request</Button>
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
