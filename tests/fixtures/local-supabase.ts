import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LocalStatus = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
};

// Always discover this checkout's local stack; never consume application/remote env vars.
let localStatus: LocalStatus | undefined;
export function localSupabaseStatus() {
  // shortcut: one stack per test worker; restart the worker after restarting the local stack.
  if (localStatus) return localStatus;
  const status = JSON.parse(
    execFileSync(resolve('node_modules/.bin/supabase'), ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  ) as LocalStatus;
  if (status.API_URL !== 'http://127.0.0.1:56321') {
    throw new Error('Integration fixtures require the isolated local Supabase API on port 56321.');
  }
  return (localStatus = status);
}

export function localSupabase() {
  const status = localSupabaseStatus();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const client = () => createClient(status.API_URL, status.ANON_KEY, options);
  const tokenClient = (accessToken: string) =>
    createClient(status.API_URL, status.ANON_KEY, {
      ...options,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const userIds: string[] = [];

  async function provisionUser() {
    const email = `admin-boundary-${randomUUID()}@example.test`;
    const password = `Boundary-${randomUUID()}!`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`Local Auth fixture provisioning failed: ${error?.message}`);
    userIds.push(data.user.id);
    return { id: data.user.id, email, password };
  }

  async function allowlist(id: string) {
    return service.from('admin_profiles').insert({ id });
  }

  async function signIn(user: { email: string; password: string }) {
    const signedIn = client();
    const { data, error } = await signedIn.auth.signInWithPassword(user);
    if (error || !data.session)
      throw new Error(`Local Auth fixture sign-in failed: ${error?.message}`);
    return { client: signedIn, session: data.session };
  }

  async function cleanup() {
    // Deleting these fixture users also removes their sessions and Profiles by FK cascade.
    for (const id of userIds.splice(0)) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error(`Local Auth fixture cleanup failed: ${error.message}`);
    }
  }

  return { client, tokenClient, service, provisionUser, allowlist, signIn, cleanup };
}

export async function readProfile(client: SupabaseClient) {
  return client.from('admin_profiles').select('id, phone, theme');
}

// Local postgres setup only: never imported by application code.
let ownerStackChecked = false;
export function localOwnerSql(query: string): Record<string, unknown>[] {
  if (!ownerStackChecked) {
    localSupabaseStatus();
    const project = execFileSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "com.supabase.cli.project"}}',
        'supabase_db_diy-instax-package-contracts',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    if (project !== 'diy-instax-package-contracts')
      throw new Error('Owner fixture requires this worktree project.');
    ownerStackChecked = true;
  }
  const returnsRows =
    /^\s*(select|with)\b/i.test(query) ||
    /^\s*(insert|update|delete)\b[\s\S]*\breturning\s/i.test(query);
  const statement = returnsRows
    ? `with fixture_rows as (${query}) select coalesce(json_agg(fixture_rows),'[]') from fixture_rows`
    : query;
  const output = execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_diy-instax-package-contracts',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-c',
      statement,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return returnsRows ? JSON.parse(output) : [];
}

function sqlLiteral(value: unknown) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return `'${(typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll("'", "''")}'`;
}

export function ownerInsert<T extends Record<string, unknown>>(table: string, row: T | T[]) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid fixture table.');
  const rows = Array.isArray(row) ? row : [row];
  const columns = Object.keys(rows[0]);
  if (!columns.every((column) => /^[a-z_]+$/.test(column)))
    throw new Error('Invalid fixture column.');
  const data = localOwnerSql(
    `insert into public.${table} (${columns.join(',')}) values ${rows.map((item) => `(${columns.map((column) => sqlLiteral(item[column])).join(',')})`).join(',')} returning *`
  );
  return { data: data[0] as T & { id: string }, error: null };
}

export function ownerUpdate(table: string, id: string, changes: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(table) || !Object.keys(changes).every((column) => /^[a-z_]+$/.test(column)))
    throw new Error('Invalid fixture identifier.');
  localOwnerSql(
    `update public.${table} set ${Object.entries(changes)
      .map(([key, value]) => `${key}=${sqlLiteral(value)}`)
      .join(',')} where id=${sqlLiteral(id)}::uuid`
  );
  return { error: null };
}

export function cleanupEvents(ids: string[]) {
  if (!ids.length) return { error: null };
  const selected = ids
    .map((id) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Fixture cleanup requires Event IDs.');
      return `'${id}'::uuid`;
    })
    .join(',');
  localOwnerSql(`do $$ begin
    delete from public.event_media_assets where event_id in (${selected});
    delete from private.package_readiness_windows where event_id in (${selected});
    delete from public.booth_reload_requests where event_id in (${selected});
    delete from public.additional_film_package_entries where event_id in (${selected});
    delete from public.operation_receipts where event_id in (${selected});
    delete from public.activity_events where event_id in (${selected});
    delete from public.additional_print_entries where event_id in (${selected});
    delete from public.film_stock_entries where event_id in (${selected});
    delete from public.print_attempt_events where attempt_id in (select id from public.print_attempts where event_id in (${selected}));
    delete from public.print_attempts where event_id in (${selected});
    delete from public.captures where event_id in (${selected});
    delete from public.guest_sessions where event_id in (${selected});
    delete from public.booth_handoffs where event_id in (${selected});
    delete from public.booth_grants where event_id in (${selected});
    delete from public.booth_runs where event_id in (${selected});
    delete from public.events where id in (${selected});
  end $$`);
  return { error: null };
}

// Serial local creation tests only; never activate accounting or reset a stack.
export function setPackageCreationDefault() {
  const rows = localOwnerSql(`select pg_catalog.pg_get_expr(d.adbin,d.adrelid) as expression
    from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
    where d.adrelid='public.events'::regclass and a.attname='accounting_version'`);
  const expression = String(rows[0]?.expression);
  if (!/^[12]$/.test(expression)) throw new Error('Unexpected Event creation default.');
  localOwnerSql('alter table public.events alter column accounting_version set default 2');
  return () =>
    localOwnerSql(
      `alter table public.events alter column accounting_version set default ${expression}`
    );
}
