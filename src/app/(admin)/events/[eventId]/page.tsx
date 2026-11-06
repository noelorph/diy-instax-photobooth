import { getHistoryEvent } from '@/lib/events/history';
import { HistoryDetail } from '@/features/admin/events/history-detail';
import { OperationsPanel } from '@/features/admin/operations/panel';
import { getOperationalEvent } from '@/features/admin/operations/read';
import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getDraft } from '@/lib/events/drafts';
import { DraftForm } from '@/features/admin/events/draft-form';
import {
  createDraftAction,
  recoverDraftCreationAction,
  updateDraftAction,
} from '@/features/admin/events/actions';

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ attemptPage?: string; activityPage?: string | string[] }>;
}) {
  const { eventId } = await params;
  const query = await searchParams;
  const candidate =
    typeof query?.activityPage === 'string' && /^\d+$/.test(query.activityPage)
      ? Number(query.activityPage)
      : 0;
  const activityPage = Number.isSafeInteger(candidate) && candidate <= 1000000 ? candidate : 0;
  const history = await getHistoryEvent(eventId, activityPage);
  if (history.status === 'success')
    return <HistoryDetail result={history} activityPage={activityPage} />;
  if (history.status === 'unavailable')
    return (
      <section>
        <PageHeader title="Unable to load Event" />
        <FormFeedback kind="error">
          {history.error}{' '}
          <Button asChild variant="secondary">
            <a href={`/events/${encodeURIComponent(eventId)}?activityPage=${activityPage}`}>
              Try again
            </a>
          </Button>
        </FormFeedback>
      </section>
    );
  const page = Number(query?.attemptPage ?? 0);
  const operations = await getOperationalEvent(eventId, page);
  const result = await getDraft(eventId);
  const panel =
    operations.status === 'success' ? (
      <OperationsPanel event={operations.event} adminUserId={operations.adminUserId} />
    ) : (
      <FormFeedback kind="error">
        Unable to load Event operations. Reload to try again.
        <Button asChild variant="quiet">
          <a href={`/events/${encodeURIComponent(eventId)}`}>Try again</a>
        </Button>
      </FormFeedback>
    );
  if (operations.status === 'unavailable')
    return (
      <section className="max-w-5xl min-w-0">
        <PageHeader title="Unable to load Event" />
        {panel}
      </section>
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
      <DraftForm
        key={result.draft.id}
        adminUserId={operations.status === 'success' ? operations.adminUserId : ''}
        recoverAction={recoverDraftCreationAction}
        initial={result.draft}
        createAction={createDraftAction}
        updateAction={updateDraftAction}
      />
      {panel}
    </>
  );
}
