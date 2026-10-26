'use client';

import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Temporal } from '@js-temporal/polyfill';
import { MapPin, Package, Printer, UserRound } from 'lucide-react';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import styles from './draft.module.css';
import type { DraftEvent } from '@/lib/events/drafts';
import {
  validateDraftFormData,
  parseDraftEventInput,
  draftInputFromFormData,
  type DraftFieldErrors,
  type DraftEventInput,
} from './draft-event.schema';
import type { DraftActionState } from './state';
import { DeleteDraft } from './delete-draft';

export type DraftFormProps = {
  initial?: DraftEvent;
  createAction: (state: DraftActionState, data: FormData) => Promise<DraftActionState>;
  updateAction: (
    id: string,
    revision: number,
    state: DraftActionState,
    data: FormData
  ) => Promise<DraftActionState>;
};

function localTime(instant: string, zone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString();
}

const subscribeToHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export function DraftForm({ initial, createAction, updateAction }: DraftFormProps) {
  const id = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  // Keep the revision belonging to this editor; a server refresh must never
  // silently attach a newer revision to the Admin's older form values.
  const [saved, setSaved] = useState(
    initial ? { id: initial.id, revision: initial.revision } : undefined
  );
  const creation = useRef<FormData | null>(null);
  const [recoveringCreation, setRecoveringCreation] = useState(false);
  const [edited, setEdited] = useState(false);
  const [editedErrorFields, setEditedErrorFields] = useState<(keyof DraftEventInput)[]>([]);
  const [liveErrors, setLiveErrors] = useState<DraftFieldErrors>({});
  const hydrated = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverSnapshot);
  const initialValues: DraftEventInput = initial
    ? {
        ...initial,
        startsAtLocal: localTime(initial.startsAtUtc, initial.timeZone),
        endsAtLocal: localTime(initial.endsAtUtc, initial.timeZone),
      }
    : {
        title: '',
        venueAddress: '',
        timeZone: '',
        startsAtLocal: '',
        endsAtLocal: '',
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        filmPackageCount: 0,
      };
  const { register, control, reset, setValue } = useForm<DraftEventInput>({
    defaultValues: initialValues,
  });
  const timeZone = useWatch({ control, name: 'timeZone' });
  const packageInput = useWatch({ control, name: 'filmPackageCount' });
  const packages = Number(packageInput);
  const validPackages =
    String(packageInput).trim() !== '' &&
    Number.isInteger(packages) &&
    packages >= 0 &&
    packages <= 214_748_364;
  const [state, submit, pending] = useActionState<DraftActionState, FormData>(
    async (previous, data) => {
      setEdited(false);
      setEditedErrorFields([]);
      setLiveErrors({});
      data = creation.current ?? data;
      const fieldErrors = validateDraftFormData(data);
      if (Object.keys(fieldErrors).length) return { status: 'invalid', fieldErrors };
      if (!saved && !creation.current) {
        data.set('operationId', crypto.randomUUID());
        creation.current = data;
      }
      try {
        const result = saved
          ? await updateAction(saved.id, saved.revision, previous, data)
          : await createAction(previous, data);
        if (result.status === 'success') {
          setSaved({ id: result.id, revision: result.revision });
          const latest = result.draft ?? {
            ...parseDraftEventInput(draftInputFromFormData(data)),
            id: result.id,
            revision: result.revision,
            state: 'Draft' as const,
          };
          setCurrent(latest);
          reset({
            ...latest,
            startsAtLocal: localTime(latest.startsAtUtc, latest.timeZone),
            endsAtLocal: localTime(latest.endsAtUtc, latest.timeZone),
          });
          setEditing(false);
          creation.current = null;
          setRecoveringCreation(false);
        } else if (!saved) {
          if (result.status === 'invalid') creation.current = null;
          setRecoveringCreation(result.status !== 'invalid');
        }
        return result;
      } catch (error) {
        unstable_rethrow(error);
        if (!saved) setRecoveringCreation(true);
        return {
          status: 'unavailable',
          error: 'The save could not be confirmed. Check your connection and try again.',
        };
      }
    },
    { status: 'idle' }
  );
  useEffect(() => {
    feedback.current?.focus();
  }, [state]);
  useEffect(() => {
    if (editing && current) editor.current?.querySelector('input')?.focus();
  }, [editing, current]);
  const errors: DraftFieldErrors = state.status === 'invalid' ? { ...state.fieldErrors } : {};
  for (const name of editedErrorFields) delete errors[name];
  if (state.status === 'invalid') Object.assign(errors, liveErrors);
  const hasFieldErrors = Object.entries(errors).some(
    ([name, message]) => message && name !== 'state' && name !== 'expectedRevision'
  );
  const error =
    state.status === 'invalid'
      ? (errors.expectedRevision ??
        errors.state ??
        (hasFieldErrors ? 'Correct the highlighted fields and try again.' : undefined))
      : state.status === 'conflict' || state.status === 'unavailable'
        ? state.error
        : state.status === 'not_found'
          ? 'Draft not found. Return to Events to choose a Draft.'
          : undefined;

  const creationClosed = !saved && (state.status === 'conflict' || state.status === 'not_found');

  function keepPendingCreation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!saved && (pending || (recoveringCreation && !creationClosed))) event.preventDefault();
  }

  function field(name: keyof DraftEventInput, label: string, type = 'text', help?: string) {
    return (
      <FormField id={`${id}-${name}`} label={label} help={help} error={errors[name]}>
        {(a11y) => (
          <Input
            {...register(name)}
            {...a11y}
            defaultValue={initialValues[name]}
            type={type}
            required
            min={type === 'number' ? 0 : undefined}
            step={type === 'number' ? 1 : type === 'datetime-local' ? 'any' : undefined}
            autoComplete={
              name === 'clientEmail'
                ? 'email'
                : name === 'clientPhone'
                  ? 'tel'
                  : name === 'clientName'
                    ? 'name'
                    : 'off'
            }
          />
        )}
      </FormField>
    );
  }

  if (current && !editing) {
    const format = new Intl.DateTimeFormat('en-GB', {
      timeZone: current.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false,
    });
    return (
      <section className={styles.content}>
        <Link className={styles.link} href="/events">
          Back to Events
        </Link>
        <PageHeader
          title={current.title}
          description={`${format.format(new Date(current.startsAtUtc))} – ${format.format(new Date(current.endsAtUtc))} · ${current.timeZone}`}
          meta={
            <>
              <StatusBadge status="Draft" />
              <span>Revision {current.revision}</span>
            </>
          }
          action={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={!hydrated}
                onClick={() => {
                  setEdited(true);
                  setEditing(true);
                }}
              >
                Edit Draft
              </Button>
              <DeleteDraft
                eventId={current.id}
                revision={current.revision}
                title={current.title}
                disabled={!hydrated}
              />
            </>
          }
        />
        <section className={styles.bookingOverview} aria-label="Booking">
          <h2>Booking</h2>
          <dl>
            <div>
              <dt>
                <UserRound size={20} aria-hidden="true" />
                Client
              </dt>
              <dd>
                {current.clientName}
                <br />
                <span>{current.clientEmail}</span>
                <br />
                <span>{current.clientPhone}</span>
              </dd>
            </div>
            <div>
              <dt>
                <MapPin size={20} aria-hidden="true" />
                Venue
              </dt>
              <dd>{current.venueAddress}</dd>
            </div>
            <div>
              <dt>
                <Package size={20} aria-hidden="true" />
                Film Packages
              </dt>
              <dd>{current.filmPackageCount}</dd>
            </div>
            <div>
              <dt>
                <Printer size={20} aria-hidden="true" />
                Total booked prints
              </dt>
              <dd>
                <output aria-label="Total booked prints">{current.filmPackageCount * 10}</output>
              </dd>
            </div>
          </dl>
          {current.filmPackageCount === 0 ? (
            <p className={styles.overdue}>
              Add at least one Film Package before starting Booth Mode.
            </p>
          ) : null}
        </section>
        {state.status === 'success' && !edited ? (
          <FormFeedback kind="success" feedbackRef={feedback} tabIndex={-1}>
            {state.confirmation}
          </FormFeedback>
        ) : null}
        {!initial ? (
          <Link className={styles.link} href={`/events/${current.id}`}>
            View saved Draft
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <div className={styles.content}>
      <Link
        className={styles.link}
        href="/events"
        aria-disabled={!saved && (pending || (recoveringCreation && !creationClosed))}
        onClick={keepPendingCreation}
      >
        Back to Events
      </Link>
      <PageHeader
        title={saved ? 'Edit Draft' : 'Create Event'}
        description="Save the booking as a Draft."
        meta={
          <>
            <StatusBadge status="Draft" />
            {saved ? <span>Revision {saved.revision}</span> : null}
          </>
        }
      />
      <form
        ref={editor}
        className={styles.form}
        action={submit}
        noValidate
        aria-busy={pending}
        onReset={(event) => event.preventDefault()}
        onChange={(event) => {
          setEdited(true);
          const name = event.target.name as keyof DraftEventInput;
          if (state.status === 'invalid') {
            const affectedFields: (keyof DraftEventInput)[] = [name];
            if (name === 'startsAtLocal') affectedFields.push('endsAtLocal');
            if (name === 'timeZone') affectedFields.push('startsAtLocal', 'endsAtLocal');
            setEditedErrorFields((fields) => [...new Set([...fields, ...affectedFields])]);
            setLiveErrors(validateDraftFormData(new FormData(event.currentTarget)));
          }
        }}
        onSubmit={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        {!hydrated ? <FormFeedback kind="status">Preparing Draft editor…</FormFeedback> : null}
        <div className={styles.editorGrid}>
          <section className={styles.detailsCard}>
            <fieldset disabled={pending || !hydrated || recoveringCreation}>
              <legend>Event details</legend>
              <div className={styles.fields}>
                <div className={styles.fullWidth}>{field('title', 'Event name')}</div>
                <div className={styles.fullWidth}>{field('venueAddress', 'Venue address')}</div>
                <div className={styles.fullWidth}>
                  {field(
                    'timeZone',
                    'Venue time zone',
                    'text',
                    'Use an IANA time zone, such as Asia/Manila.'
                  )}
                </div>
              </div>
            </fieldset>
            <fieldset disabled={pending || !hydrated || recoveringCreation}>
              <legend>Schedule</legend>
              <p className={styles.help}>
                Venue-local time{timeZone ? ` · ${timeZone}` : ' · enter the venue time zone above'}
                .
              </p>
              <div className={styles.fields}>
                {field(
                  'startsAtLocal',
                  'Scheduled start',
                  'datetime-local',
                  `Local time in ${timeZone || 'the venue time zone'}.`
                )}
                {field(
                  'endsAtLocal',
                  'Scheduled end',
                  'datetime-local',
                  `Local time in ${timeZone || 'the venue time zone'}.`
                )}
              </div>
            </fieldset>
            <fieldset disabled={pending || !hydrated || recoveringCreation}>
              <legend>Client contact</legend>
              <p className={styles.help}>These contact details belong to this Event.</p>
              <div className={styles.fields}>
                <div className={styles.fullWidth}>{field('clientName', 'Client name')}</div>
                {field('clientEmail', 'Client email', 'email')}
                {field('clientPhone', 'Client phone', 'tel')}
              </div>
            </fieldset>
          </section>
          <fieldset
            className={styles.bookingCard}
            disabled={pending || !hydrated || recoveringCreation}
          >
            <legend>Booking</legend>
            <div className={styles.stepper}>
              <Button
                type="button"
                variant="quiet"
                aria-label="Remove one Film Package"
                disabled={!validPackages || packages <= 0}
                onClick={() => {
                  setEdited(true);
                  setValue('filmPackageCount', packages - 1, { shouldDirty: true });
                }}
              >
                −
              </Button>
              {field(
                'filmPackageCount',
                'Booked Film Packages',
                'number',
                'Each package includes 10 prints.'
              )}
              <Button
                type="button"
                variant="quiet"
                aria-label="Add one Film Package"
                disabled={!validPackages || packages >= 214_748_364}
                onClick={() => {
                  setEdited(true);
                  setValue('filmPackageCount', packages + 1, { shouldDirty: true });
                }}
              >
                +
              </Button>
            </div>
            <div className={styles.total}>
              <output aria-label="Total booked prints">
                {validPackages ? packages * 10 : '—'}
              </output>
              <span>total booked prints</span>
            </div>
            <p className={styles.help}>You can edit these details while the Event is Draft.</p>
            {validPackages && packages === 0 ? (
              <p className={styles.overdue}>
                Add at least one Film Package before starting Booth Mode.
              </p>
            ) : null}
          </fieldset>
        </div>
        {error ? (
          <FormFeedback kind="error" feedbackRef={feedback} tabIndex={-1}>
            {error}
          </FormFeedback>
        ) : null}
        {recoveringCreation && !creationClosed ? (
          <FormFeedback kind="status">
            Your request details have been kept. Retry the save to check its result before editing
            this booking.
          </FormFeedback>
        ) : null}
        {(state.status === 'conflict' || errors.expectedRevision) && saved ? (
          <div>
            <p>
              Your entered values are still here. Reloading replaces them with the latest saved
              details.
            </p>
            <a className={styles.link} href={`/events/${saved.id}`}>
              Reload latest Draft
            </a>
          </div>
        ) : null}
        {state.status === 'success' && !edited && !pending ? (
          <FormFeedback kind="success" feedbackRef={feedback} tabIndex={-1}>
            {state.confirmation}
          </FormFeedback>
        ) : null}
        <div className={styles.actions}>
          <Link
            className={`${buttonVariants({ variant: 'secondary' })} ${styles.cancel}`}
            href="/events"
            aria-disabled={!saved && (pending || (recoveringCreation && !creationClosed))}
            onClick={keepPendingCreation}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={pending || !hydrated || creationClosed}>
            {recoveringCreation && !creationClosed ? 'Retry save' : 'Save Draft'}
          </Button>
        </div>
        {pending ? <FormFeedback kind="status">Saving Draft…</FormFeedback> : null}
      </form>
    </div>
  );
}
