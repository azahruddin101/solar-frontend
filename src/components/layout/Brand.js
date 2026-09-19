import { Sun } from 'lucide-react';
import { cx } from '../kit';

export const PRODUCT_NAME = 'Innovbit';

export function BrandMark({ size = 32, className }) {
  return (
    <span style={{ width: size, height: size }} className={cx('grid shrink-0 place-items-center rounded-lg bg-brand text-brand-fg', className)}>
      <Sun style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

export function BrandLogo({ className, dark }) {
  return (
    <span className={cx('flex items-center gap-2.5 text-[15px] font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900', className)}>
      <BrandMark /> {PRODUCT_NAME}
    </span>
  );
}
