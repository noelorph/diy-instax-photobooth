import { DraftList } from '@/features/admin/events/draft-list';
import { listDrafts } from '@/lib/events/drafts';

export default async function EventsPage() {
  const result = await listDrafts();
  if (result.status === 'unavailable')
    return (
      <section className="draft-content">
        <h1>Events</h1>
        <p className="auth-alert" role="alert">
          {result.error}
        </p>
        {/* A full navigation retries the server read even on the same URL. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="draft-link" href="/events">
          Try again
        </a>
      </section>
    );
  // This authenticated Server Component reads the clock after request-time data.
  // eslint-disable-next-line react-hooks/purity
  return <DraftList drafts={result.drafts} now={Date.now()} />;
}
