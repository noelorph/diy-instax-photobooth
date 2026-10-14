import Link from 'next/link';
import type { DraftEvent } from '@/lib/events/drafts';

export function DraftList({ drafts, now }: { drafts: DraftEvent[]; now: number }) {
  return (
    <section className="draft-content">
      <header className="draft-list-header">
        <div>
          <h1>Events</h1>
          <p>Draft bookings, ordered by scheduled start.</p>
        </div>
        <Link className="draft-primary-link" href="/events/new">
          Create Event
        </Link>
      </header>
      {drafts.length === 0 ? (
        <div className="draft-empty">
          <h2>No Draft Events yet.</h2>
          <p>Create an Event to save its booking details.</p>
        </div>
      ) : (
        <table className="draft-table">
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
                    <Link href={`/events/${draft.id}`}>{draft.title}</Link>
                    <p>{draft.venueAddress}</p>
                  </th>
                  <td>
                    <span className="draft-cell-label">Venue-local schedule</span>
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
                    <span className="draft-badge">Draft</span>
                    {Date.parse(draft.startsAtUtc) < now ? (
                      <p className="draft-overdue">Overdue Draft</p>
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
