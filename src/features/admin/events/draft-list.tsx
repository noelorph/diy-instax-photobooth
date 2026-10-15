import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { buttonVariants } from '@/components/ui/button';
import styles from './draft.module.css';
import type { DraftEvent } from '@/lib/events/drafts';

export function DraftList({ drafts, now }: { drafts: DraftEvent[]; now: number }) {
  return (
    <section className={styles.content}>
      <PageHeader
        title="Events"
        description="Draft bookings, ordered by scheduled start."
        action={
          <Link className={buttonVariants()} href="/events/new">
            Create Event
          </Link>
        }
      />
      {drafts.length === 0 ? (
        <EmptyState
          title="No Draft Events yet."
          description="Create an Event to save its booking details."
        />
      ) : (
        <table className={styles.table}>
          <caption>Draft Events · earliest scheduled start first</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Venue-local schedule</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => {
              const format = new Intl.DateTimeFormat('en-GB', {
                timeZone: draft.timeZone,
                dateStyle: 'medium',
                timeStyle: 'short',
                hour12: false,
              });
              return (
                <tr key={draft.id}>
                  <th scope="row">
                    <span className={styles.cellLabel}>Event</span>
                    <Link className={styles.link} href={`/events/${draft.id}`}>
                      {draft.title}
                    </Link>
                    <p>{draft.venueAddress}</p>
                  </th>
                  <td>
                    <span className={styles.cellLabel}>Venue-local schedule</span>
                    <time dateTime={draft.startsAtUtc}>
                      {format.format(new Date(draft.startsAtUtc))}
                    </time>
                    <br />
                    <span>to </span>
                    <time dateTime={draft.endsAtUtc}>
                      {format.format(new Date(draft.endsAtUtc))}
                    </time>
                    <br />
                    <span>{draft.timeZone}</span>
                  </td>
                  <td>
                    <span className={styles.cellLabel}>Status</span>
                    <StatusBadge status="Draft" />
                    {Date.parse(draft.startsAtUtc) < now ? (
                      <p className={styles.overdue}>Overdue Draft</p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
