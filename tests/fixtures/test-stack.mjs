import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const workdir = process.env.INSTAX_TEST_WORKDIR;
const projectId = workdir ? 'diy-instax-retirement-verification' : 'diy-instax-package-contracts';
export const testStack = {
  projectId,
  apiUrl: `http://127.0.0.1:${workdir ? 58321 : 56321}`,
  mailpitUrl: `http://127.0.0.1:${workdir ? 58324 : 56324}`,
  databaseContainer: `supabase_db_${projectId}`,
  storageContainer: `supabase_storage_${projectId}`,
};

export function readLocalSupabaseStatus() {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const status = JSON.parse(
    execFileSync(
      resolve('node_modules/.bin/supabase'),
      ['status', '-o', 'json', ...(workdir ? ['--workdir', resolve(workdir)] : [])],
      options
    )
  );
  if (status.API_URL !== testStack.apiUrl)
    throw new Error('Fixtures require the selected local test stack.');
  const project = execFileSync(
    'docker',
    [
      'inspect',
      '--format',
      '{{index .Config.Labels "com.supabase.cli.project"}}',
      testStack.databaseContainer,
    ],
    options
  ).trim();
  if (project !== projectId) throw new Error('Fixture database belongs to another project.');
  const existing = JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        testStack.databaseContainer,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "select json_build_object('events',(select count(*) from public.events),'liveEvents',(select count(*) from public.events where state='Live'),'unresolvedAttempts',(select count(*) from public.print_attempts where state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')))",
      ],
      options
    )
  );
  if (existing.liveEvents || existing.unresolvedAttempts)
    throw new Error(
      'Test stack contains an existing Live Event or unresolved print. Use an isolated INSTAX_TEST_WORKDIR; do not settle or delete existing work.'
    );
  if (existing.events)
    throw new Error(
      'The local test stack is not empty. Use a clean isolated INSTAX_TEST_WORKDIR; existing Event records were not removed.'
    );
  return status;
}
