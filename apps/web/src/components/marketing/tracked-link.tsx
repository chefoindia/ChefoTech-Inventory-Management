'use client';

import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { track, type AnalyticsEvent, type AnalyticsProps } from '@/lib/analytics';

type Props = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  children: ReactNode;
  event?: AnalyticsEvent;
  eventProps?: AnalyticsProps;
};

/** A Next link that reports a marketing event when clicked (no personal data). */
export function TrackedLink({ children, event = 'cta_click', eventProps, onClick, ...rest }: Props) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        track(event, { href: String(rest.href), ...eventProps });
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
