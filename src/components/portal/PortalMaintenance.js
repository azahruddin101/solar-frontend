'use client';

import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Card, EmptyState, LoadingBlock, PageHeader, Select, toast, buttonClass } from '../kit';
import PortalAmcPackagesCard, { portalAmcListLabel } from './PortalAmcPackagesCard';

export default function PortalMaintenance() {
  const { company } = useSession();
  const { data, loading, error, setData } = useResource('/api/portal/proposals');
  const [savingPackage, setSavingPackage] = useState(null);
  const withAmc = (data || []).filter((p) => p.amcPackages);
  const [proposalId, setProposalId] = useState('');

  const active = withAmc.find((p) => p.id === proposalId) || withAmc[0];
  const money = (v) => formatMoney(v, company?.currency, { decimals: 2 });
  const amcPriceLabel = (price) => (Number(price) > 0 ? money(price) : 'Free');

  const submitRequest = async (packageName, requestedDate, note, requestId) => {
    if (!active) return;
    setSavingPackage(packageName);
    try {
      const next = await api(`/api/portal/proposals/${active.id}/amc-requests`, {
        method: 'POST',
        body: { packageName, requestedDate, note, requestId },
      });
      setData((rows) => rows.map((row) => (row.id === active.id ? { ...row, amcPackages: next.amcPackages } : row)));
      toast.success(requestId ? 'Request updated' : 'Requested — your provider will assign a technician');
    } catch (e) {
      toast.error(e.message);
    }
    setSavingPackage(null);
  };

  return (
    <>
      <PageHeader
        title="Maintenance (AMC)"
        description="Your provider schedules your maintenance visits. Need something extra? Request an optional service on a date that suits you."
      >
        {withAmc.length > 1 && (
          <Select aria-label="Proposal" value={active?.id || ''} onValue={setProposalId} className="w-72 max-w-full">
            {withAmc.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {portalAmcListLabel(p.amcPackages) ? ` (${portalAmcListLabel(p.amcPackages)})` : ''}
              </option>
            ))}
          </Select>
        )}
        {active && <Link href={`/portal/${active.id}`} className={buttonClass({ variant: 'secondary' })}>View proposal</Link>}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading ? (
        <LoadingBlock />
      ) : !withAmc.length ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No maintenance packages yet"
            description="When your provider configures AMC packages, they will appear here."
          >
            <Link href="/portal" className={buttonClass({ variant: 'secondary' })}>My proposals</Link>
          </EmptyState>
        </Card>
      ) : (
        active && (
          <PortalAmcPackagesCard
            key={active.id}
            embedded
            amcPackages={active.amcPackages}
            amcPriceLabel={amcPriceLabel}
            savingPackage={savingPackage}
            onSubmitRequest={submitRequest}
            className="mb-0"
          />
        )
      )}
    </>
  );
}
