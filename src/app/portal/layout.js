import PortalLayout from '@/components/portal/PortalLayout';

export const metadata = { title: 'My proposals · Innovbit' };

export default function Layout({ children }) {
  return <PortalLayout>{children}</PortalLayout>;
}
