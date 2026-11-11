import PortalLayout from '@/components/portal/PortalLayout';

export const metadata = { title: 'My proposals · SolarDesy' };

export default function Layout({ children }) {
  return <PortalLayout>{children}</PortalLayout>;
}
