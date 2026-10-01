'use client';

// "Choose a front page": opens when a proposal PDF is downloaded. Only page 1 changes with the
// choice — the rest of the PDF is the same. The previews are sketches in the company's colours
// (with the 3D render when there is one); the last choice is preselected next time.
import { Check, Download } from 'lucide-react';
import { useState } from 'react';
import { COVER_STYLES, lastCover, rememberCover } from '@/lib/coverStyles';
import { resolveTheme } from '@/lib/theme';
import { cx } from '../ui';
import { Button, Modal } from './index';

const INK = '#0f172a';
const SOFT = '#eef2f6';
const LINE = '#e2e8f0';

/** The cover picture inside a preview: the render, or a brand gradient. */
function Picture({ id, t, snapshot, x, y, w, h, r = 0 }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-clip`}><rect x={x} y={y} width={w} height={h} rx={r} /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.primary} stopOpacity="0.55" />
          <stop offset="1" stopColor={t.primary} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${id}-fill)`} />
        {snapshot ? <image href={snapshot} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" /> : <circle cx={x + w * 0.7} cy={y + h * 0.45} r={Math.min(w, h) * 0.2} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2.5" />}
      </g>
    </>
  );
}

const Bar = ({ x, y, w, h = 3, fill = INK, o = 1 }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} opacity={o} />;

function Stats({ t, x, y, w, n = 4 }) {
  const col = w / n;
  return (
    <>
      <rect x={x} y={y} width={w} height={44} rx={4.5} fill={SOFT} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <circle cx={x + i * col + 14} cy={y + 11.5} r={5.5} fill={i === 1 ? t.accent : t.primary} />
          <Bar x={x + i * col + 9} y={y + 21} w={col * 0.5} h={2} o={0.35} />
          <Bar x={x + i * col + 9} y={y + 27} w={col * 0.62} h={4.5} />
          <Bar x={x + i * col + 9} y={y + 36} w={col * 0.45} h={2} o={0.35} />
        </g>
      ))}
    </>
  );
}

function Card({ t, x, y, w, h }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#fff" stroke={LINE} />
      <circle cx={x + 9.5} cy={y + 9.8} r={4.6} fill={t.primary} />
      <Bar x={x + 18} y={y + 9} w={w * 0.5} h={3.5} />
      {[20, 27, 34].map((d, i) => <Bar key={d} x={x + 18} y={y + d} w={w * (0.62 - i * 0.1)} h={2} o={0.35} />)}
    </>
  );
}

const Cards = ({ t, y }) => (
  <>
    <Card t={t} x={7} y={y} w={75.5} h={50} />
    <Card t={t} x={85.5} y={y} w={72.5} h={50} />
    <rect x={161} y={y} width={42.5} height={50} rx={3} fill={SOFT} />
  </>
);

const Header = ({ t }) => (
  <>
    <Bar x={9} y={11} w={46} h={9} fill={t.primary} />
    <Bar x={118} y={9} w={40} h={3.5} />
    <Bar x={118} y={16} w={32} h={2} o={0.35} />
    <Bar x={118} y={21} w={36} h={2} o={0.35} />
  </>
);

const PREVIEWS = {
  magazine: ({ t, snapshot }) => (
    <>
      <Header t={t} />
      <rect x={0} y={30.5} width={210} height={126.5} fill="#fbf7ee" />
      <defs><clipPath id="magazine-curve"><path d="M115.5 30.5 C94.5 58 92.4 84 80.9 106.4 C71.4 126.6 63 144.4 51.5 157 L210 157 L210 30.5 Z" /></clipPath></defs>
      <g clipPath="url(#magazine-curve)"><Picture id="magazine" t={t} snapshot={snapshot} x={51} y={30.5} w={159} h={126.5} /></g>
      <Bar x={11} y={41} w={48} h={2} o={0.4} />
      <Bar x={11} y={50} w={62} h={9} />
      <Bar x={11} y={65} w={44} h={8} fill={t.primary} />
      <Bar x={11} y={79} w={52} h={3.5} o={0.6} />
      <path d="M12 132 q20 -14 42 -10" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M17 146 q18 -3 36 -12" fill="none" stroke={t.accent} strokeWidth="1.6" strokeLinecap="round" />
      <rect x={171} y={36.5} width={35} height={39} rx={3} fill="#26302c" opacity="0.6" />
      <Stats t={t} x={6.5} y={160.5} w={197} />
      <Cards t={t} y={208} />
      <path d="M0 272 C46 264 84 278 130 279 C168 280 189 270 210 265 L210 297 L0 297 Z" fill={t.primary} />
      <path d="M0 272 C46 264 84 278 130 279 C168 280 189 270 210 265 L210 297 L0 297 Z" fill="#000" opacity="0.4" />
    </>
  ),
  photo: ({ t, snapshot }) => (
    <>
      <Picture id="photo" t={t} snapshot={snapshot} x={0} y={0} w={210} h={158} />
      <defs>
        <linearGradient id="photo-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={210} height={158} fill="url(#photo-shade)" />
      <rect x={9} y={8} width={52} height={19} rx={2.5} fill="#fff" />
      <Bar x={13} y={13} w={44} h={9} fill={t.primary} />
      <Bar x={160} y={10} w={40} h={3.5} fill="#fff" />
      <Bar x={168} y={17} w={32} h={2} fill="#fff" o={0.7} />
      <Bar x={164} y={22} w={36} h={2} fill="#fff" o={0.7} />
      <Bar x={12} y={100} w={52} h={2} fill="#fff" o={0.7} />
      <Bar x={12} y={108} w={96} h={10} fill="#fff" />
      <Bar x={12} y={126} w={40} h={8} fill="#fff" />
      <Bar x={57} y={129} w={50} h={4} fill="#fff" o={0.8} />
      <Bar x={12} y={138} w={11.5} h={1.4} fill={t.accent} />
      <Bar x={12} y={146} w={70} h={2.5} fill="#fff" o={0.8} />
      <Stats t={t} x={6.5} y={162} w={197} />
      <Cards t={t} y={210} />
      <rect x={0} y={272} width={210} height={25} fill={t.primary} />
      <rect x={0} y={272} width={210} height={25} fill="#000" opacity="0.5" />
      <rect x={0} y={272} width={210} height={1.2} fill={t.accent} />
      <Bar x={11} y={281} w={50} h={3.5} fill="#fff" />
    </>
  ),
  panel: ({ t, snapshot }) => (
    <>
      <defs>
        <linearGradient id="panel-col" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.2" />
          <stop offset="1" stopColor="#000" stopOpacity="0.65" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={76} height={297} fill={t.primary} />
      <rect x={0} y={0} width={76} height={297} fill="url(#panel-col)" />
      <rect x={74.8} y={0} width={1.2} height={297} fill={t.accent} />
      <rect x={9} y={10} width={50} height={22} rx={2.5} fill="#fff" />
      <Bar x={13} y={16.5} w={42} h={9} fill={t.primary} />
      <Bar x={9} y={43} w={42} h={3.5} fill="#fff" />
      <Bar x={9} y={49.2} w={11.5} h={1.2} fill={t.accent} />
      <Bar x={9} y={56} w={34} h={2} fill="#fff" o={0.6} />
      <Bar x={9} y={61} w={38} h={2} fill="#fff" o={0.6} />
      <Bar x={9} y={84} w={46} h={2} fill="#fff" o={0.6} />
      <Bar x={9} y={91} w={54} h={8} fill="#fff" />
      <Bar x={9} y={103} w={36} h={8} fill="#fff" />
      <Bar x={9} y={118} w={38} h={8} fill="#fff" />
      <Bar x={9} y={131} w={44} h={3} fill="#fff" o={0.7} />
      <Bar x={9} y={140} w={50} h={2} fill="#fff" o={0.6} />
      <rect x={9} y={191} width={57} height={0.4} fill="#fff" opacity="0.5" />
      <Bar x={9} y={201} w={44} h={3.5} fill="#fff" />
      {[210, 216, 222, 228].map((y, i) => <Bar key={y} x={9} y={y} w={48 - i * 5} h={2} fill="#fff" o={0.6} />)}
      <rect x={9} y={256} width={30} height={30} rx={2.5} fill="#fff" />
      <Picture id="panel" t={t} snapshot={snapshot} x={82} y={10} w={122} h={104} r={4.5} />
      <Stats t={t} x={82} y={119} w={122} n={2} />
      <Stats t={t} x={82} y={166} w={122} n={2} />
      <Card t={t} x={82} y={215} w={122} h={46} />
      <rect x={82} y={266} width={122} height={23} rx={3} fill={SOFT} />
    </>
  ),
  minimal: ({ t, snapshot }) => (
    <>
      <Header t={t} />
      <rect x={14} y={31.3} width={182} height={0.5} fill={LINE} />
      <rect x={14} y={31.1} width={22} height={0.9} fill={t.accent} />
      <Bar x={14} y={41} w={52} h={2} fill={t.primary} />
      <Bar x={14} y={48} w={110} h={10} />
      <Bar x={14} y={64} w={38} h={7} fill={t.primary} />
      <Bar x={57} y={66.5} w={48} h={4} o={0.7} />
      <Bar x={14} y={77} w={76} h={2.5} o={0.4} />
      <Picture id="minimal" t={t} snapshot={snapshot} x={14} y={86} w={182} h={98} r={4.5} />
      <Stats t={t} x={6.5} y={188} w={197} />
      <Cards t={t} y={236} />
      <Bar x={55} y={290} w={100} h={2} o={0.35} />
    </>
  ),
};

export function CoverPreview({ style, theme, snapshot, className }) {
  const Preview = PREVIEWS[style];
  return (
    <svg viewBox="0 0 210 297" className={className} role="img" aria-hidden>
      <rect width={210} height={297} fill="#fff" />
      <Preview t={resolveTheme(theme)} snapshot={snapshot} />
    </svg>
  );
}

/**
 * `onDownload(style)` builds the PDF; the dialog stays open (busy) until it settles.
 * `snapshot` is the 3D render for the previews, `company` supplies the brand colours.
 */
export default function CoverPicker({ open, ...props }) {
  return open ? <Picker {...props} /> : null; // mounted per opening, so it starts from the last choice
}

function Picker({ onClose, onDownload, company, snapshot = null, title = 'Choose a front page', submitLabel = 'Download PDF' }) {
  const [style, setStyle] = useState(lastCover);
  const [busy, setBusy] = useState(false);
  const theme = company?.features?.pdfBranding !== false ? company?.theme : null; // as the PDF resolves it

  const download = async () => {
    rememberCover(style);
    setBusy(true);
    try {
      await onDownload(style);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      description="Pick the first page of the PDF. All the other pages stay the same."
      size="lg"
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon={Download} loading={busy} onClick={download}>{submitLabel}</Button></>}
    >
      <div role="radiogroup" aria-label="Front page" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COVER_STYLES.map((c) => {
          const on = c.id === style;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setStyle(c.id)} onDoubleClick={download} className={cx('group relative rounded-xl border p-2 text-left transition', on ? 'border-brand bg-brand-soft/40 ring-2 ring-brand' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
              <CoverPreview style={c.id} theme={theme} snapshot={snapshot} className="w-full rounded-md border border-slate-200 bg-white shadow-xs" />
              {on && <span className="absolute right-3.5 top-3.5 grid h-6 w-6 place-items-center rounded-full bg-brand text-brand-fg shadow"><Check className="h-4 w-4" /></span>}
              <div className="mt-2 px-0.5 text-sm font-semibold text-slate-900">{c.name}</div>
              <div className="px-0.5 text-xs leading-snug text-slate-500">{c.description}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
