import { Profile } from '@/features/admin/profile/profile';
import { readAdminProfile } from '@/features/admin/profile/read';
import { saveProfile, changePassword, signOut } from '@/features/admin/profile/actions';
export default async function ProfilePage() {
  const profile = await readAdminProfile();
  return (
    <Profile
      initial={profile}
      saveAction={saveProfile}
      passwordAction={changePassword}
      signOutAction={signOut}
    />
  );
}
