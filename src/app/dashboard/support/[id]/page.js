'use client';

import { use } from 'react';
import TicketThread from '@/components/tickets/TicketThread';

export default function Page({ params }) {
  const { id } = use(params);
  return <TicketThread id={id} />;
}
