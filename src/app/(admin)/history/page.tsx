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
        description="Completed and Cancelled Events retain anonymous operational totals."
      />
      {summary.status === 'success' ? (
        <div className="mb-6 flex flex-wrap gap-6 tabular-nums">
          <p>{summary.events} non-cancelled Events</p>
          <p>{summary.captures} Captures</p>
        </div>
      ) : (
        <FormFeedback kind="error">{summary.error}</FormFeedback>
      )}
      {history.status === 'unavailable' ? (
        <FormFeedback kind="error">{history.error}</FormFeedback>
      ) : history.events.length === 0 ? (
        <p>No completed or cancelled Events yet.</p>
      ) : (
        <ul className="grid gap-4">
          {history.events.map((event) => (
            <li key={event.id} className="border-b border-ds-border-subtle py-4">
              <Link className="text-ds-primary underline" href={`/events/${event.id}`}>
                {event.title}
              </Link>
              <p>
                {event.state} · {event.redacted_at ? 'Client redacted' : 'Client details retained'}
              </p>
              <p>{event.venue_address}</p>
              {!event.redacted_at && (
                <div>
                  <p>{event.client_name}</p>
                  <p className="wrap-anywhere">{event.client_email}</p>
                  <p>{event.client_phone}</p>
                </div>
              )}
              <div className="my-3 flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
                <p>{event.film_package_count} Film Packages</p>
                <p>{event.original_print_allowance} original prints</p>
                {(() => {
                  const value = totals.get(event.id);
                  return value?.status === 'success' ? (
                    <>
                      <p>{value.event.additionalPrints} Additional Prints</p>
                      <p>{value.event.confirmedPrints} Confirmed Prints</p>
                      <p>
                        {value.event.originalAllowance +
                          value.event.additionalPrints -
                          value.event.confirmedPrints -
                          value.event.allowanceReserved}{' '}
                        prints remaining
                      </p>
                      <p>{value.event.captures} Captures recorded</p>
                    </>
                  ) : (
                    <p>Accounting totals unavailable. Open Event to retry.</p>
                  );
                })()}
              </div>
              {event.starts_at && (
                <p>
                  {new Date(event.starts_at).toLocaleString('en', { timeZone: event.time_zone })} ·{' '}
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
