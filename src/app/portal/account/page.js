import AccountSettings from '@/components/layout/AccountSettings';
import { PageHeader } from '@/components/kit';

export default function Page() {
  return (
    <>
      <PageHeader title="My account" description="Your name and password." />
      <AccountSettings />
    </>
  );
}
