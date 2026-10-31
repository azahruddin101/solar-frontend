import AreaGuard from '@/components/layout/AreaGuard';

// Staff only reach this area with the subsidies View permission (see lib/permissions.js).
export default function Layout({ children }) {
  return <AreaGuard area="subsidies">{children}</AreaGuard>;
}
