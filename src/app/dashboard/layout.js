import 'quill/dist/quill.snow.css'; // rich text editor (Settings → Proposal PDF)
import DashboardLayout from '@/components/dashboard/DashboardLayout';

export const metadata = { title: 'Workspace · SolarDesy' };

export default function Layout({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
