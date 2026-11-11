import AgentLayout from '@/components/agent/AgentLayout';

export const metadata = { title: 'My tasks · SolarDesy' };

export default function Layout({ children }) {
  return <AgentLayout>{children}</AgentLayout>;
}
