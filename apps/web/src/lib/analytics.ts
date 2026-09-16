/**
 * Privacy-conscious analytics abstraction.
 *
 * Nothing is loaded unless NEXT_PUBLIC_ANALYTICS_PROVIDER is set. Events carry no personal data:
 * only event names and small categorical properties (plan key, page path, CTA label).
 *
 * Providers: "plausible" (cookieless), "umami" (cookieless, self-hostable), "ga4".
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible|umami|ga4
 *   NEXT_PUBLIC_ANALYTICS_ID=<GA4 measurement id | umami website id | plausible domain>
 *   NEXT_PUBLIC_ANALYTICS_HOST=<script host for plausible/umami, optional>
 */

export type AnalyticsEvent =
  | 'landing_view'
  | 'cta_click'
  | 'signup_started'
  | 'signup_completed'
  | 'demo_requested'
  | 'contact_submitted'
  | 'pricing_interaction'
  | 'feature_page_interaction'
  | 'login_completed';

export type AnalyticsProps = Record<string, string | number | boolean>;

export const ANALYTICS = {
  provider: (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER?.trim().toLowerCase() || '') as '' | 'plausible' | 'umami' | 'ga4',
  id: process.env.NEXT_PUBLIC_ANALYTICS_ID?.trim() || '',
  host: process.env.NEXT_PUBLIC_ANALYTICS_HOST?.trim().replace(/\/$/, '') || '',
};

export const analyticsEnabled = !!ANALYTICS.provider && !!ANALYTICS.id;

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: AnalyticsProps; u?: string }) => void;
    umami?: { track: (event: string, props?: AnalyticsProps) => void };
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Fire a product/marketing event. Safe to call anywhere on the client; no-op on the server or when disabled. */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'production' && !analyticsEnabled) {
    // Helps verify wiring during development without shipping anything.
    if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === '1') console.debug('[analytics]', event, props);
    return;
  }
  if (!analyticsEnabled) return;
  try {
    switch (ANALYTICS.provider) {
      case 'plausible':
        window.plausible?.(event, { props });
        break;
      case 'umami':
        window.umami?.track(event, props);
        break;
      case 'ga4':
        window.gtag?.('event', event, props);
        break;
    }
  } catch {
    /* analytics must never break the page */
  }
}

/** Page view for providers that do not auto-track client-side navigation. */
export function pageView(path: string): void {
  if (typeof window === 'undefined' || !analyticsEnabled) return;
  try {
    if (ANALYTICS.provider === 'ga4') window.gtag?.('event', 'page_view', { page_path: path });
    // plausible and umami track history changes themselves.
  } catch {
    /* ignore */
  }
}
