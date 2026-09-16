'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { ANALYTICS, analyticsEnabled, pageView } from '@/lib/analytics';

/**
 * Loads the configured analytics provider (if any) after the page is interactive and reports
 * client-side navigations. Renders nothing when analytics is not configured.
 */
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) pageView(pathname);
  }, [pathname]);

  if (!analyticsEnabled) return null;

  if (ANALYTICS.provider === 'plausible') {
    const host = ANALYTICS.host || 'https://plausible.io';
    return <Script defer data-domain={ANALYTICS.id} src={`${host}/js/script.js`} strategy="afterInteractive" />;
  }
  if (ANALYTICS.provider === 'umami') {
    const host = ANALYTICS.host || 'https://cloud.umami.is';
    return <Script defer data-website-id={ANALYTICS.id} src={`${host}/script.js`} strategy="afterInteractive" />;
  }
  if (ANALYTICS.provider === 'ga4') {
    return (
      <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS.id)}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ANALYTICS.id.replace(/'/g, '')}',{anonymize_ip:true,send_page_view:false});`}
        </Script>
      </>
    );
  }
  return null;
}
