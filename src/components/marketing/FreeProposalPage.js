'use client';

// The maker keeps a draft in the browser and reads it as it starts, so it is drawn in the browser only.
import dynamic from 'next/dynamic';

const FreeProposal = dynamic(() => import('./FreeProposal'), { ssr: false, loading: () => <div className="grid h-dvh place-items-center bg-slate-50 text-sm text-slate-400">Opening the proposal maker…</div> });

export default function FreeProposalPage() {
  return <FreeProposal />;
}
