'use client';

import { useEffect, useRef } from 'react';
import { cx } from '../kit';

/** Fades its children up the first time they scroll into view. */
export default function Reveal({ as: Tag = 'div', delay = 0, className, children, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add('is-visible');
        io.disconnect();
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={cx('reveal', className)} style={{ '--reveal-delay': `${delay}ms` }} {...props}>
      {children}
    </Tag>
  );
}
