import type { Metadata } from 'next';
import { LegalPage, LegalSection, ContactLine } from '@/components/marketing/legal';
import { analyticsEnabled, ANALYTICS } from '@/lib/analytics';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Which cookies and browser storage the PharmaOS website and application use, and why.',
  alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie policy" path="/cookies" effective="16 September 2026" intro="PharmaOS uses a small number of cookies and browser storage items, all needed to run the service or, where enabled, to measure website traffic without identifying you.">
      <LegalSection title="Strictly necessary">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-fg-subtle"><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Purpose</th><th className="py-2">Duration</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr><td className="py-2 pr-4 font-mono text-[13px]">pharmaos_rt</td><td className="py-2 pr-4">Secure, HTTP-only cookie holding your refresh token so you stay signed in to the application. Set only after you sign in.</td><td className="py-2">Until you sign out or the session expires</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-[13px]">Browser storage (localStorage)</td><td className="py-2 pr-4">Application conveniences: the bill you are typing at the counter, drafts prepared for review, your selected outlet, push-notification preference. Nothing here is sent to third parties.</td><td className="py-2">Until cleared</td></tr>
          </tbody>
        </table>
        <p>These cannot be switched off without breaking sign-in or the counter workflow.</p>
      </LegalSection>
      <LegalSection title="Analytics">
        {analyticsEnabled ? (
          <p>The public website uses {ANALYTICS.provider === 'ga4' ? 'Google Analytics 4 with IP anonymisation' : ANALYTICS.provider === 'plausible' ? 'Plausible Analytics, a cookieless tool that does not store personal identifiers' : 'Umami Analytics, a cookieless tool that does not store personal identifiers'} to understand which pages are visited and which buttons are used. Events are limited to page paths and button labels; no form contents, names or emails are sent.</p>
        ) : (
          <p>No analytics or advertising cookies are set on this website at present. If we enable a web analytics tool in future, this page will describe it and it will be configured without personal identifiers where the tool allows.</p>
        )}
      </LegalSection>
      <LegalSection title="Third-party services inside the application">
        <p>Razorpay Checkout may set its own cookies when you pay for a subscription, under Razorpay&apos;s policy. Uploaded images and documents are served from our file-storage provider. Optional AI features send requests to Google&apos;s Gemini API from our servers, not from your browser.</p>
      </LegalSection>
      <LegalSection title="Managing cookies">
        <p>You can delete cookies and site data through your browser settings. Doing so signs you out of PharmaOS and clears any bill drafts kept on that device.</p>
        <ContactLine />
      </LegalSection>
    </LegalPage>
  );
}
