'use client';

// Integrations: one tab per lead source. The tab lives in ?source= so Facebook Login can return to the right one.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/kit';
import GoogleAdsIntegration from '@/components/admin/leads/integrations/GoogleAdsIntegration';
import GoogleSheetIntegration, { SheetIcon } from '@/components/admin/leads/integrations/GoogleSheetIntegration';
import MetaLeadsIntegration from '@/components/admin/leads/integrations/MetaLeadsIntegration';
import { FacebookIcon, GoogleAdsIcon } from '@/components/admin/leads/integrations/integrationUi';
import { settingsSearchUrl } from '@/lib/settingsQuery';

const SOURCES = [
  { id: 'meta', label: 'Facebook & Instagram', icon: FacebookIcon, Component: MetaLeadsIntegration },
  { id: 'google', label: 'Google Ads', icon: GoogleAdsIcon, Component: GoogleAdsIntegration },
  { id: 'sheet', label: 'Google Sheet', icon: SheetIcon, Component: GoogleSheetIntegration },
];
// older links
const ALIASES = { lead: 'meta', 'google-ads': 'google' };

export default function AdminLeadIntegrations() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted = searchParams.get('source');
  // Back from Facebook Login (?meta=…) always opens the Facebook tab
  const id = searchParams.get('meta') ? 'meta' : ALIASES[wanted] || wanted;
  const active = SOURCES.find((s) => s.id === id) || SOURCES[0];
  const Active = active.Component;
  return (
    <div className="space-y-5">
      <Tabs
        tabs={SOURCES.map(({ id: tabId, label, icon }) => ({ id: tabId, label, icon }))}
        value={active.id}
        onChange={(next) => router.replace(settingsSearchUrl(pathname, searchParams, { tab: 'integrations', source: next }), { scroll: false })}
      />
      <Active key={active.id} />
    </div>
  );
}
