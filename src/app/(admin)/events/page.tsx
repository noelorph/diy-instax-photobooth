import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Button } from '@/components/ui/button';
import { DraftList } from '@/features/admin/events/draft-list';
import { listDrafts } from '@/lib/events/drafts';

export default async function EventsPage() {
  const result = await listDrafts();
  if (result.status === 'unavailable')
    return (
      <section className="max-w-5xl min-w-0">
        <PageHeader title="Events" />
        <FormFeedback kind="error">{result.error}</FormFeedback>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            {/* A full navigation retries the server read even on the same URL. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/events">Try again</a>
          </Button>
        </div>
      </section>
    );
  // This authenticated Server Component reads the clock after request-time data.
  // eslint-disable-next-line react-hooks/purity
  return <DraftList drafts={result.drafts} now={Date.now()} />;
}
