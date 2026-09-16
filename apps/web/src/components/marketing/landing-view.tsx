'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track, type AnalyticsEvent } from '@/lib/analytics';

/** Fires a page-level marketing event once on mount (landing or feature page view). */
export function LandingView({ event = 'landing_view' }: { event?: AnalyticsEvent }) {
  const pathname = usePathname();
  useEffect(() => {
    track(event, { page: pathname ?? '/' });
  }, [event, pathname]);
  return null;
}
