import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { EmptyState } from '@/components/shared/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import type { DashboardReadResult } from './types';
import styles from './dashboard.module.css';

export function Dashboard({
  result,
  now,
  activityDays,
  page,
}: {
  result: DashboardReadResult;
  now: string;
  activityDays: 7 | 30;
  page: number;
}) {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          new Date(now).toLocaleDateString('en', { dateStyle: 'full', timeZone: 'UTC' }) + ' · UTC'
        }
        action={
          <Link href="/events/new" className={buttonVariants()}>
            Create Event
          </Link>
        }
      />
      {result.status === 'unavailable' ? (
        <FormFeedback kind="error">
          {result.error}{' '}
          <Button asChild variant="secondary">
            <a href="/dashboard">Try again</a>
          </Button>
        </FormFeedback>
      ) : (
        <>
          <div className={styles.summaries}>
            <section className={styles.card} aria-label="Monthly Events">
              <h2>Monthly Events</h2>
              <strong>{result.summary.monthEvents}</strong>
              <p>Current month · each venue’s local time</p>
            </section>
            <section className={styles.card} aria-label="Total Events booked">
              <h2>Total Events booked</h2>
              <strong>{result.summary.totalBookedEvents}</strong>
              <p>Excludes Cancelled Events</p>
            </section>
            <section className={styles.card} aria-label="Upcoming Events">
              <h2>Upcoming Events</h2>
              <strong>{result.summary.upcomingEvents}</strong>
              <p>Draft and Live with future starts</p>
            </section>
          </div>
          <div className={styles.events}>
            {result.liveEvent ? (
              <section className={`${styles.card} ${styles.live}`} aria-label="Live Event">
                <p className={styles.eyebrow}>
                  Event Live ·{' '}
                  <span>
                    {result.liveEvent.runState
                      ? `Booth ${result.liveEvent.runState}`
                      : 'Booth not started'}
                  </span>
                </p>
                <h2 className={styles.title}>{result.liveEvent.title}</h2>
                <p>{result.liveEvent.venueAddress}</p>
                <Schedule event={result.liveEvent} />
                <div className={styles.counts}>
                  <p>{result.liveEvent.counts.totalBookedPrints} total booked prints</p>
                  <p>{result.liveEvent.counts.printed} Confirmed Prints</p>
                  <p>{result.liveEvent.counts.printsAvailable} Prints available</p>
                  <p>
                    {result.liveEvent.counts.unresolved} Pending print
                    {result.liveEvent.counts.unresolved === 1 ? '' : 's'}
                  </p>
                </div>
                <Link href={`/events/${result.liveEvent.id}`} className={buttonVariants()}>
                  Open Live Event
                </Link>
              </section>
            ) : (
              <EmptyState
                title="No Live Event"
                description="Start a prepared Draft when you are ready."
              />
            )}
            <section className={styles.card} aria-label="Up next">
              <h2>Up next</h2>
              {result.summary.nextEvent ? (
                <>
                  <h3 className={styles.title}>{result.summary.nextEvent.title}</h3>
                  <p>{result.summary.nextEvent.venueAddress}</p>
                  <Schedule event={result.summary.nextEvent} />
                  <Link
                    href={`/events/${result.summary.nextEvent.id}`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    Open Event
                  </Link>
                </>
              ) : (
                <p>No upcoming Events. Create a Draft to plan your next Event.</p>
              )}
            </section>
          </div>
          <section className={styles.card} aria-label="Recent activity">
            <div className={styles.activityHeader}>
              <h2 className={styles.title}>Recent activity</h2>
              <nav aria-label="Activity window">
                {([7, 30] as const).map((days) => (
                  <Link
                    key={days}
                    href={`/dashboard?activityDays=${days}`}
                    aria-current={days === activityDays ? 'page' : undefined}
                    className={buttonVariants({
                      variant: days === activityDays ? 'primary' : 'secondary',
                    })}
                  >
                    {days} days
                  </Link>
                ))}
              </nav>
            </div>
            {result.activity.length ? (
              <ol className={styles.activity}>
                {result.activity.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.occurredAt}>
                      {new Date(item.occurredAt).toLocaleString('en', {
                        timeZone: 'UTC',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}{' '}
                      UTC
                    </time>
                    <div>
                      <p>
                        {Object.hasOwn(activityLabels, item.operationKind)
                          ? activityLabels[item.operationKind]
                          : 'Event activity recorded'}
                      </p>
                      {item.eventId ? (
                        <Link href={`/events/${item.eventId}`}>Open Event</Link>
                      ) : (
                        <span>Event no longer available</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No activity on this page in the last {activityDays} days.</p>
            )}
            <nav className={styles.pagination} aria-label="Activity pages">
              {page > 0 && (
                <Link
                  className={buttonVariants({ variant: 'secondary' })}
                  href={`/dashboard?activityDays=${activityDays}&page=${page - 1}`}
                >
                  Newer activity
                </Link>
              )}
              <span>Page {page + 1}</span>
              {result.hasNextPage && (
                <Link
                  className={buttonVariants({ variant: 'secondary' })}
                  href={`/dashboard?activityDays=${activityDays}&page=${page + 1}`}
                >
                  Older activity
                </Link>
              )}
            </nav>
          </section>
        </>
      )}
    </div>
  );
}
function Schedule({
  event,
}: {
  event: { startsAtUtc: string; endsAtUtc: string; timeZone: string };
}) {
  const format = (instant: string) =>
    new Date(instant).toLocaleString('en', {
      timeZone: event.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return (
    <p>
      {format(event.startsAtUtc)} – {format(event.endsAtUtc)}
      <br />
      {event.timeZone}
    </p>
  );
}
const activityLabels: Record<string, string> = {
  create_draft: 'Draft created',
  update_draft: 'Draft updated',
  start: 'Booth Mode started',
  complete: 'Event completed',
  cancel: 'Event cancelled',
  begin_delete_draft: 'Draft removal started',
  complete_delete_draft: 'Draft removed',
  add_packages: 'Film Packages added',
  pause: 'Booth Paused',
  resume: 'Booth Resumed',
  finish: 'Booth Mode finished',
  record_capture: 'Capture recorded',
  observe: 'Print feedback recorded',
  resolve_attempt: 'Print outcome resolved',
  reserve: 'Print requested',
  dispatch: 'Print dispatched',
  end_session: 'Guest session ended',
  reconcile: 'Print outcome reconciled',
};
