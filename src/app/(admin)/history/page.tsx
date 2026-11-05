import { getHistorySummary, getOperationalEvent } from '@/features/admin/operations/read';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { listHistory, listPendingMediaRemovals } from '@/lib/events/history';
import { PendingRemovals } from '@/features/admin/operations/pending-removals';
export default async function HistoryPage() {
  const [history, pending, summary] = await Promise.all([
    listHistory(),
    listPendingMediaRemovals(),
    getHistorySummary(),
  ]);
  const totals = new Map<string, Awaited<ReturnType<typeof getOperationalEvent>>>();
  if (history.status === 'success') {
    await Promise.all(
      history.events.map(async (event) => totals.set(event.id, await getOperationalEvent(event.id)))
    );
  }
  return (
    <section className="max-w-5xl min-w-0">
      <PageHeader
        title="History"
        description="Completed and Cancelled Events retain their booking, media and operational history."
      />
      {summary.status === 'success' ? (
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-ds-surface-muted px-5 py-4 text-lg leading-[1.625rem] font-semibold tabular-nums">
          <p className="m-0">{summary.events} non-cancelled Events</p>
          <p className="m-0">{summary.captures} Captures</p>
        </div>
      ) : (
        <FormFeedback kind="error">{summary.error}</FormFeedback>
      )}
      {history.status === 'unavailable' ? (
        <FormFeedback kind="error">{history.error}</FormFeedback>
      ) : history.events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ds-border bg-ds-primary-soft px-6 py-10 text-center text-ds-text-muted">
          No completed or cancelled Events yet.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {history.events.map((event) => (
            <li
              key={event.id}
              className="grid gap-1 rounded-2xl border border-ds-border-subtle bg-ds-surface p-5 [&_p]:m-0"
            >
              <Link
                className="text-lg leading-[1.625rem] font-semibold text-ds-primary underline underline-offset-4 wrap-anywhere hover:text-ds-primary-hover"
                href={`/events/${event.id}`}
              >
                {event.title}
              </Link>
              <p className="text-sm leading-5 font-medium text-ds-text-muted">
                {event.state} · Client details retained
              </p>
              <p className="wrap-anywhere">{event.venue_address}</p>
              <div className="text-sm leading-5 text-ds-text-muted">
                <p>{event.client_name}</p>
                <p className="wrap-anywhere">{event.client_email}</p>
                <p>{event.client_phone}</p>
              </div>
              <div className="my-3 flex flex-wrap gap-2 text-sm leading-5 tabular-nums [&_p]:rounded-full [&_p]:bg-ds-primary-soft [&_p]:px-3 [&_p]:py-1">
                {(() => {
                  const value = totals.get(event.id);
                  return value?.status === 'success' ? (
                    <>
                      <p>
                        {value.event.counts.originalPackages +
                          value.event.counts.additionalPackages}{' '}
                        Film Packages
                      </p>
                      <p>{value.event.counts.totalBookedPrints} total booked prints</p>
                      <p>{value.event.counts.printed} printed</p>
                      <p>{value.event.counts.unresolved} print pending</p>
                      <p>{value.event.counts.printsRemaining} prints remaining</p>
                      <p>{value.event.captures} Captures recorded</p>
                    </>
                  ) : (
                    <p>Accounting totals unavailable. Open Event to retry.</p>
                  );
                })()}
              </div>
              {event.starts_at && (
                <p className="text-sm leading-5 text-ds-text-muted">
                  {new Date(event.starts_at).toLocaleString('en', { timeZone: event.time_zone })} –{' '}
                  {new Date(event.ends_at).toLocaleString('en', { timeZone: event.time_zone })} ·{' '}
                  {event.time_zone}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.status === 'success' ? (
        <PendingRemovals removals={pending.removals} />
      ) : (
        <FormFeedback kind="error">{pending.error}</FormFeedback>
      )}
    </section>
  );
}
