import AdminLayout from '@/components/admin/AdminLayout';

export const metadata = { title: 'Admin console · Innovbit' };

export default function Layout({ children }) {
  return <AdminLayout>{children}</AdminLayout>;
}
