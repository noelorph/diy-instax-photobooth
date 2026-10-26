import { createPackageFixture, type PackageFixture } from './package-contract';
import { localOwnerSql, setPackageCreationDefault } from './local-supabase';

export async function createPackageBrowserFixture(): Promise<PackageFixture> {
  const policy = String(
    localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode
  );
  if (!['disabled', 'simulated'].includes(policy))
    throw new Error('Unexpected local printer policy.');
  const restoreDefault = setPackageCreationDefault();
  try {
    const fixture = await createPackageFixture();
    return {
      ...fixture,
      async dispose() {
        try {
          await fixture.dispose();
        } finally {
          try {
            localOwnerSql(`update public.printer_completion_policy set mode='${policy}' where id`);
          } finally {
            restoreDefault();
          }
        }
      },
    };
  } catch (error) {
    restoreDefault();
    throw error;
  }
}
