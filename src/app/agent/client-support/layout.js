import AreaGuard from '@/components/layout/AreaGuard';

// Staff only reach this area with the Client support View permission (see lib/permissions.js).
export default function Layout({ children }) {
  return <AreaGuard area="helpdesk">{children}</AreaGuard>;
}
