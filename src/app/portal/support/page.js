import { Suspense } from 'react';
import TicketList from '@/components/tickets/TicketList';

export default function Page() {
  return (
    <Suspense>
      <TicketList channel="portal" />
    </Suspense>
  );
}
