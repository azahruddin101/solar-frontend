import AdminLayout from '@/components/admin/AdminLayout';

export const metadata = { title: 'Admin console · SolarDesy' };

export default function Layout({ children }) {
  return <AdminLayout>{children}</AdminLayout>;
}
