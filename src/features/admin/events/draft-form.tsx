'use client';

import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Temporal } from '@js-temporal/polyfill';
import type { DraftEvent } from '@/lib/events/drafts';
import {
  validateDraftFormData,
  type DraftFieldErrors,
  type DraftEventInput,
} from './draft-event.schema';
import type { DraftActionState } from './state';

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
  const feedback = useRef<HTMLParagraphElement>(null);
  // Keep the revision belonging to this editor; a server refresh must never
  // silently attach a newer revision to the Admin's older form values.
  const [saved, setSaved] = useState(
    initial ? { id: initial.id, revision: initial.revision } : undefined
  );
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
        originalPrintAllowance: 0,
      };
  const { register, control } = useForm<DraftEventInput>({
    defaultValues: initialValues,
  });
  const timeZone = useWatch({ control, name: 'timeZone' });
  const [state, submit, pending] = useActionState<DraftActionState, FormData>(
    async (previous, data) => {
      setEdited(false);
      setEditedErrorFields([]);
      setLiveErrors({});
      const fieldErrors = validateDraftFormData(data);
      if (Object.keys(fieldErrors).length) return { status: 'invalid', fieldErrors };
      try {
        const result = saved
          ? await updateAction(saved.id, saved.revision, previous, data)
          : await createAction(previous, data);
        if (result.status === 'success') setSaved({ id: result.id, revision: result.revision });
        return result;
      } catch (error) {
        unstable_rethrow(error);
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

  function field(name: keyof DraftEventInput, label: string, type = 'text', help?: string) {
    const errorId = `${id}-${name}-error`;
    const helpId = `${id}-${name}-help`;
    return (
      <div className="auth-field">
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <input
          {...register(name)}
          defaultValue={initialValues[name]}
          id={`${id}-${name}`}
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
          aria-invalid={Boolean(errors[name])}
          aria-describedby={
            [help ? helpId : '', errors[name] ? errorId : ''].filter(Boolean).join(' ') || undefined
          }
        />
        {help ? (
          <p className="field-help" id={helpId}>
            {help}
          </p>
        ) : null}
        {errors[name] ? (
          <p className="auth-field-error" id={errorId}>
            {errors[name]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="draft-content">
      <Link className="draft-link" href="/events">
        Back to Events
      </Link>
      <header>
        <h1>{initial ? 'Edit Draft' : 'Create Event'}</h1>
        <p>Save the booking details for this Event.</p>
        <div className="draft-meta">
          <span className="draft-badge">Draft</span>
          {saved ? <span>Revision {saved.revision}</span> : null}
        </div>
      </header>
      <form
        className="auth-form draft-form"
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
        {!hydrated ? (
          <p className="field-help" role="status">
            Preparing Draft editor…
          </p>
        ) : null}
        <fieldset disabled={pending || !hydrated}>
          <legend>Event and venue</legend>
          <div className="draft-fields">
            {field('title', 'Event name')}
            {field('venueAddress', 'Venue address')}
            {field(
              'timeZone',
              'Venue time zone',
              'text',
              'Use an IANA time zone, such as Asia/Manila.'
            )}
          </div>
        </fieldset>
        <fieldset disabled={pending || !hydrated}>
          <legend>Schedule</legend>
          <p className="field-help">
            Venue-local time{timeZone ? ` · ${timeZone}` : ' · enter the venue time zone above'}.
          </p>
          <div className="draft-fields">
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
        <fieldset disabled={pending || !hydrated}>
          <legend>Client contact</legend>
          <p className="field-help">These contact details belong to this Event.</p>
          <div className="draft-fields">
            {field('clientName', 'Client name')}
            {field('clientEmail', 'Client email', 'email')}
            {field('clientPhone', 'Client phone', 'tel')}
          </div>
        </fieldset>
        <fieldset disabled={pending || !hydrated}>
          <legend>Booking</legend>
          <p className="field-help">
            Enter the package count and guest prints separately. Either can be zero while preparing
            a Draft.
          </p>
          <div className="draft-fields">
            {field('filmPackageCount', 'Booked Film Packages', 'number')}
            {field(
              'originalPrintAllowance',
              'Original Print Allowance',
              'number',
              'Number of individual guest prints booked.'
            )}
          </div>
        </fieldset>
        {error ? (
          <p className="auth-alert" role="alert" ref={feedback} tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {(state.status === 'conflict' || errors.expectedRevision) && saved ? (
          <div>
            <p>
              Your entered values are still here. Reloading replaces them with the latest saved
              details.
            </p>
            <a href={`/events/${saved.id}`}>Reload latest Draft</a>
          </div>
        ) : null}
        {state.status === 'success' && !edited && !pending ? (
          <p className="profile-success" role="status" ref={feedback} tabIndex={-1}>
            {state.confirmation}
          </p>
        ) : null}
        <div className="draft-actions">
          <button type="submit" disabled={pending || !hydrated}>
            Save Draft
          </button>
          {saved && !initial ? <Link href={`/events/${saved.id}`}>View saved Draft</Link> : null}
        </div>
        {pending ? <p role="status">Saving Draft…</p> : null}
      </form>
    </div>
  );
}
