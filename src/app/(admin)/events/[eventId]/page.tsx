import { OperationsPanel } from '@/features/admin/operations/panel';
import { getOperationalEvent } from '@/features/admin/operations/read';
import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getDraft } from '@/lib/events/drafts';
import { DraftForm } from '@/features/admin/events/draft-form';
import { createDraftAction, updateDraftAction } from '@/features/admin/events/actions';

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const operations = await getOperationalEvent(eventId);
  const result = await getDraft(eventId);
  const panel =
    operations.status === 'success' ? (
      <OperationsPanel
        event={operations.event}
        simulatorEnabled={
          process.env.NODE_ENV !== 'production' && process.env.BOOTH_SIMULATOR_ENABLED === 'true'
        }
      />
    ) : (
      <FormFeedback kind="error">
        Unable to load Event operations. Reload to try again.
      </FormFeedback>
    );
  if (operations.status === 'success' && operations.event.state !== 'Draft')
    return (
      <section className="max-w-5xl min-w-0">
        <PageHeader title={operations.event.title} />
        {panel}
      </section>
    );
  if (result.status !== 'success')
    return (
      <section className="max-w-5xl min-w-0">
        <PageHeader
          title={result.status === 'not_found' ? 'Draft not found.' : 'Unable to load Draft'}
          description={
            result.status === 'not_found' ? 'Return to Events to choose a Draft.' : undefined
          }
        />
        {result.status === 'unavailable' ? (
          <FormFeedback kind="error">{result.error}</FormFeedback>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {result.status === 'unavailable' ? (
            <Button asChild variant="secondary">
              <a href={`/events/${encodeURIComponent(eventId)}`}>Try again</a>
            </Button>
          ) : null}
          <Button asChild variant="quiet">
            <Link href="/events">Back to Events</Link>
          </Button>
        </div>
      </section>
    );
  return (
    <>
      {' '}
      <DraftForm
        key={result.draft.id}
        initial={result.draft}
        createAction={createDraftAction}
        updateAction={updateDraftAction}
      />
      {panel}
    </>
  );
}
