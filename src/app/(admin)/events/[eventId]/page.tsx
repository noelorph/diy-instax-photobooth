import Link from 'next/link';
import { getDraft } from '@/lib/events/drafts';
import { DraftForm } from '@/features/admin/events/draft-form';
import { createDraftAction, updateDraftAction } from '@/features/admin/events/actions';

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const result = await getDraft(eventId);
  if (result.status !== 'success')
    return (
      <section className="draft-content">
        <h1>{result.status === 'not_found' ? 'Draft not found.' : 'Unable to load Draft'}</h1>
        {result.status === 'unavailable' ? (
          <>
            <p className="auth-alert" role="alert">
              {result.error}
            </p>
            <a className="draft-link" href={`/events/${encodeURIComponent(eventId)}`}>
              Try again
            </a>
          </>
        ) : (
          <p>Return to Events to choose a Draft.</p>
        )}
        <Link className="draft-link" href="/events">
          Back to Events
        </Link>
      </section>
    );
  return (
    <DraftForm
      key={result.draft.id}
      initial={result.draft}
      createAction={createDraftAction}
      updateAction={updateDraftAction}
    />
  );
}
