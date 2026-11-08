import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { buttonVariants } from '@/components/ui/button';
import { listHistory, listPendingMediaRemovals, type HistoryFilter } from '@/lib/events/history';
import { PendingRemovals } from '@/features/admin/operations/pending-removals';
import { HistoryStatus, HistorySchedule } from '@/features/admin/events/history-detail';
import styles from '@/features/admin/events/history-detail.module.css';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ state?: string | string[] }>;
}) {
  const query = await searchParams;
  const filter: HistoryFilter =
    query?.state === 'Completed' || query?.state === 'Cancelled' ? query.state : 'all';
  const [history, pending] = await Promise.all([listHistory(filter), listPendingMediaRemovals()]);
  return (
    <div>
      <PageHeader title="History" />
      <nav className={styles.filters} aria-label="History filters">
        {(['all', 'Completed', 'Cancelled'] as const).map((state) => (
          <Link
            key={state}
            href={`/history?state=${state}`}
            aria-current={filter === state ? 'page' : undefined}
            className={buttonVariants({ variant: filter === state ? 'primary' : 'secondary' })}
          >
            {state === 'all' ? 'All History' : state}
          </Link>
        ))}
      </nav>
      {history.status === 'unavailable' ? (
        <FormFeedback kind="error">
          {history.error}{' '}
          <a href={`/history?state=${filter}`} className={buttonVariants({ variant: 'secondary' })}>
            Try again
          </a>
        </FormFeedback>
      ) : history.events.length === 0 ? (
        <p className={styles.card}>
          {filter === 'all'
            ? 'No completed or cancelled Events yet.'
            : `No ${filter.toLowerCase()} Events yet.`}
        </p>
      ) : (
        <ul className={`${styles.card} ${styles.history}`} aria-label="Retained Events">
          {history.events.map((event) => (
            <li key={event.id}>
              <div>
                <Link className={styles.eventLink} href={`/events/${event.id}`}>
                  {event.title}
                  <ArrowUpRight size={20} aria-hidden="true" />
                </Link>
                <HistorySchedule event={event} />
                <p>
                  {event.venue_address} · {event.client_name}
                </p>
                <p>
                  {event.client_email} · {event.client_phone}
                </p>
                <p>
                  {event.counts.originalPackages} original Film Packages ·{' '}
                  {event.counts.additionalPackages} additional
                </p>
              </div>
              <HistoryStatus state={event.state} />
              <p className={styles.prints}>
                {event.counts.printed} of {event.counts.totalBookedPrints} prints confirmed
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.retention}>
        Completed and Cancelled Events are kept here as read-only records.
      </p>
      {pending.status === 'success' ? (
        <PendingRemovals removals={pending.removals} />
      ) : (
        <FormFeedback kind="error">{pending.error}</FormFeedback>
      )}
    </div>
  );
}
