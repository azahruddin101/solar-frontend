import AreaGuard from '@/components/layout/AreaGuard';

// Staff only reach this area with the inventory View permission (see lib/permissions.js).
export default function Layout({ children }) {
  return <AreaGuard area="inventory">{children}</AreaGuard>;
}
