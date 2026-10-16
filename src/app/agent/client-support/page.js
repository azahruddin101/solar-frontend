import TicketList from '@/components/tickets/TicketList';

export default function Page() {
  return <TicketList channel="clients" basePath="/agent/client-support" />;
}
