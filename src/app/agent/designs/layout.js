import AreaGuard from '@/components/layout/AreaGuard';

// Staff only reach this area with the proposals View permission (see lib/permissions.js).
export default function Layout({ children }) {
  return <AreaGuard area="proposals">{children}</AreaGuard>;
}
