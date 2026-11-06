import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { buttonVariants } from '@/components/ui/button';
import { activityLabel } from '@/features/admin/dashboard/activity-label';
import type { getHistoryEvent, HistoryEvent } from '@/lib/events/history';
import { EVENT_MEDIA_UNAVAILABLE_MESSAGE } from '@/lib/events/media-availability';
import styles from './history-detail.module.css';

type Detail = Extract<Awaited<ReturnType<typeof getHistoryEvent>>, { status: 'success' }>;
export function HistoryDetail({ result, activityPage }: { result: Detail; activityPage: number }) {
  const { event, captures, activity, hasNextPage, mediaAssetCount } = result;
  const { counts } = event;
  return (
    <div>
      <Link href="/history" className={buttonVariants({ variant: 'quiet' })}>
        Back to History
      </Link>
      <PageHeader title={event.title} meta={<HistoryStatus state={event.state} />} />
      <div className={styles.summaries}>
        <section className={styles.card} aria-label="Total booked prints">
          <h2 className={styles.eyebrow}>Total booked prints</h2>
          <strong>{counts.totalBookedPrints}</strong>
          <p>
            {counts.originalPackages} original · {counts.additionalPackages} additional packages
          </p>
        </section>
        <section className={styles.card} aria-label="Confirmed Prints">
          <h2 className={styles.eyebrow}>Confirmed Prints</h2>
          <strong>{counts.printed}</strong>
          <p>
            {counts.unresolved === 0
              ? 'No pending attempts'
              : `${counts.unresolved} pending attempts`}
          </p>
          <p>{counts.printsRemaining} prints remaining</p>
        </section>
        <section className={styles.card} aria-label="Captures">
          <h2 className={styles.eyebrow}>Captures</h2>
          <strong>{captures}</strong>
          <p>Includes Retakes</p>
        </section>
      </div>
      <div className={styles.details}>
        <section className={styles.card} aria-label="Booking record">
          <h2>Booking record</h2>
          <dl className={styles.booking}>
            <div>
              <dt>Client</dt>
              <dd>{event.client_name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{event.client_email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{event.client_phone}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{event.venue_address}</dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>
                <HistorySchedule event={event} includeZone={false} />
              </dd>
            </div>
            <div>
              <dt>Time zone</dt>
              <dd>{event.time_zone}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.card} aria-label="Event activity">
          <h2>Event activity</h2>
          {activity.length ? (
            <ol className={styles.activity}>
              {activity.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.occurredAt}>
                    {new Date(item.occurredAt).toLocaleString('en', {
                      timeZone: event.time_zone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  <p>{activityLabel(item.operationKind)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>No activity on this page.</p>
          )}
          <nav className={styles.filters} aria-label="Event activity pages">
            {activityPage > 0 && (
              <Link
                className={buttonVariants({ variant: 'secondary' })}
                href={`/events/${event.id}?activityPage=${activityPage - 1}`}
              >
                Newer activity
              </Link>
            )}
            <span>Page {activityPage + 1}</span>
            {hasNextPage && (
              <Link
                className={buttonVariants({ variant: 'secondary' })}
                href={`/events/${event.id}?activityPage=${activityPage + 1}`}
              >
                Older activity
              </Link>
            )}
          </nav>
        </section>
      </div>
      <section className={styles.media} aria-label="Event Media">
        <h2>Event Media</h2>
        <p>
          {mediaAssetCount === 0
            ? 'No Event Media attached. The default Booth presentation was used.'
            : `${mediaAssetCount} retained Event Media attachment${mediaAssetCount === 1 ? '' : 's'}. Preview unavailable.`}
        </p>
        <p>{EVENT_MEDIA_UNAVAILABLE_MESSAGE}</p>
        <p>
          Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover
          files.
        </p>
      </section>
    </div>
  );
}
export function HistoryStatus({ state }: { state: HistoryEvent['state'] }) {
  return (
    <span className={styles.status} data-state={state}>
      {state}
    </span>
  );
}
export function HistorySchedule({
  event,
  includeZone = true,
}: {
  event: HistoryEvent;
  includeZone?: boolean;
}) {
  const format = (at: string) =>
    new Date(at).toLocaleString('en', {
      timeZone: event.time_zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return (
    <p>
      {format(event.starts_at)} – {format(event.ends_at)}
      {includeZone && ` · ${event.time_zone}`}
    </p>
  );
}
