'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './draft.module.css';
import type { DraftEvent } from '@/lib/events/drafts';

export type ListedEvent = Pick<
  DraftEvent,
  'id' | 'title' | 'venueAddress' | 'timeZone' | 'startsAtUtc' | 'endsAtUtc' | 'filmPackageCount'
> & { state: 'Draft' | 'Live' };
export function DraftList({
  drafts,
  liveEvents = [],
  now,
}: {
  drafts: DraftEvent[];
  liveEvents?: ListedEvent[];
  now: number;
}) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const events = [...liveEvents, ...drafts].sort(
    (a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc) || a.id.localeCompare(b.id)
  );
  const visible = events.filter(
    (event) =>
      (filter === 'All' || event.state === filter) &&
      `${event.title} ${event.venueAddress}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <section className={styles.content}>
      <PageHeader
        title="Events"
        description="Plan upcoming Events and manage the live booth."
        action={
          <Link className={buttonVariants({ variant: 'primary' })} href="/events/new">
            <Plus aria-hidden="true" />
            Create Event
          </Link>
        }
      />
      {liveEvents.map((event) => (
        <div className={styles.liveBanner} key={event.id}>
          <StatusBadge status="Live" />
          <div>
            <strong>Live now · {event.title}</strong>
            <p>{event.venueAddress}</p>
          </div>
          <Link className={buttonVariants({ variant: 'secondary' })} href={`/events/${event.id}`}>
            Open Event
          </Link>
        </div>
      ))}
      <div className={styles.filters}>
        <div className={styles.filterButtons} role="group" aria-label="Filter Events">
          {['All', 'Draft', 'Live'].map((value) => (
            <Button
              type="button"
              key={value}
              variant={filter === value ? 'default' : 'secondary'}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <label className={styles.search}>
          <Search aria-hidden="true" size={20} />
          <Input
            type="search"
            aria-label="Search Events"
            placeholder="Search Events"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {events.length === 0 ? (
        <EmptyState
          title="No Draft Events yet."
          description="Create an Event to save its booking details."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matching Events." description="Try another search or filter." />
      ) : (
        <div className={styles.listCard}>
          <table className={styles.table}>
            <caption>Draft and Live Events · earliest scheduled start first</caption>
            <thead>
              <tr>
                {[
                  'Event',
                  'Venue-local schedule',
                  'Venue',
                  'Film Packages',
                  'Total booked prints',
                  'Status',
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => {
                const format = new Intl.DateTimeFormat('en-GB', {
                  timeZone: event.timeZone,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  hour12: false,
                });
                return (
                  <tr key={event.id}>
                    <th scope="row">
                      <span className={styles.cellLabel}>Event</span>
                      <Link className={styles.link} href={`/events/${event.id}`}>
                        {event.title}
                      </Link>
                    </th>
                    <td>
                      <span className={styles.cellLabel}>Venue-local schedule</span>
                      <time dateTime={event.startsAtUtc}>
                        {format.format(new Date(event.startsAtUtc))}
                      </time>
                      <br />
                      to{' '}
                      <time dateTime={event.endsAtUtc}>
                        {format.format(new Date(event.endsAtUtc))}
                      </time>
                      <br />
                      {event.timeZone}
                    </td>
                    <td>
                      <span className={styles.cellLabel}>Venue</span>
                      {event.venueAddress}
                    </td>
                    <td>
                      <span className={styles.cellLabel}>Film Packages</span>
                      {event.filmPackageCount}
                    </td>
                    <td>
                      <span className={styles.cellLabel}>Total booked prints</span>
                      {event.filmPackageCount * 10}
                    </td>
                    <td>
                      <span className={styles.cellLabel}>Status</span>
                      <StatusBadge status={event.state} />
                      {event.state === 'Draft' ? (
                        Date.parse(event.startsAtUtc) < now ? (
                          <p className={styles.overdue}>Overdue Draft</p>
                        ) : (
                          <p>Upcoming</p>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={styles.listFootnote}>
            Completed and Cancelled Events are in{' '}
            <Link className={styles.link} href="/history">
              History
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
