import type { Metadata } from 'next';
import { LegalPage, LegalSection, ContactLine } from '@/components/marketing/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms on which ChefoTech provides the PharmaOS pharmacy management platform to organizations and their users.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" path="/terms" effective="16 September 2026" intro="These terms govern use of the PharmaOS website and application. By creating an organization or accepting an invitation you agree to them on behalf of yourself and, where applicable, your pharmacy.">
      <LegalSection title="The service">
        <p>PharmaOS is a web-based pharmacy management platform provided by ChefoTech. It includes billing, inventory, purchases, customer and supplier accounts, documents, reports, multi-outlet management and optional AI features, as described on this website. We may improve or change features over time; we will not remove a core capability without reasonable notice to organization owners.</p>
      </LegalSection>
      <LegalSection title="Accounts and organizations">
        <p>The person who creates an organization becomes its owner and is responsible for the users they invite, the roles and permissions they grant and everything done under the organization&apos;s accounts. Keep passwords confidential and tell us promptly about any unauthorised use. You must provide accurate registration and billing details.</p>
      </LegalSection>
      <LegalSection title="Your data and responsibilities">
        <p>You own the data you enter. You are responsible for its accuracy and for having the right to collect and store it, including customer, prescription and staff information, and for complying with the laws that apply to your pharmacy, such as drug schedules, record-keeping, GST and data protection. PharmaOS helps you keep records; it does not replace the professional judgement of a pharmacist or your legal obligations.</p>
      </LegalSection>
      <LegalSection title="Plans, trials and payment">
        <p>New organizations start on a free trial for the period shown at signup. Paid plans are billed per organization in advance, monthly or yearly, at the prices and limits shown on the pricing page at the time of purchase. Plan limits are enforced by the platform. Fees are non-refundable except where the law requires otherwise. We may change prices with at least 30 days&apos; notice; changes apply from your next billing period.</p>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <p>You agree not to misuse the service: no attempts to access other organizations&apos; data, circumvent permissions or limits, reverse engineer the platform, send spam through its messaging features, upload unlawful content, or use it in a way that harms the service or other users. We may suspend access to protect the platform or other customers, and will tell you why where we reasonably can.</p>
      </LegalSection>
      <LegalSection title="AI features">
        <p>AI features are optional and depend on an API key your organization provides to a third-party model provider (currently Google Gemini) under that provider&apos;s terms and pricing. AI output can be wrong or incomplete; you must review anything it prepares before saving, dispensing or paying, and the platform is designed so that money and stock never move without a user&apos;s confirmation. You are responsible for what you choose to send to the provider through the assistant.</p>
      </LegalSection>
      <LegalSection title="Availability and support">
        <p>We aim to keep PharmaOS available at all times but do not guarantee uninterrupted service; maintenance, provider outages and events beyond our control can cause downtime. Support is provided through the contact channels on this website. The bill being typed at the counter is preserved on the device during a connection loss, but completing a sale requires a connection.</p>
      </LegalSection>
      <LegalSection title="Intellectual property">
        <p>The PharmaOS software, design and content are owned by ChefoTech and its licensors. You receive a non-exclusive, non-transferable right to use the service for your organization during your subscription. You keep all rights to your data and grant us only the rights needed to host, process, back up and display it to you.</p>
      </LegalSection>
      <LegalSection title="Termination and data export">
        <p>You may stop using the service at any time. You can export your whole organization as a JSON archive from Settings while your account is active. We may terminate or suspend accounts that breach these terms or remain unpaid after notice. After termination we may delete your data after a reasonable period, subject to legal retention requirements.</p>
      </LegalSection>
      <LegalSection title="Liability">
        <p>To the extent permitted by law, ChefoTech is not liable for indirect, incidental or consequential losses, lost profits or lost data arising from use of the service, and our total liability for any claim is limited to the fees you paid for the service in the twelve months before the claim. Nothing in these terms limits liability that cannot be limited by law.</p>
      </LegalSection>
      <LegalSection title="Governing law">
        <p>These terms are governed by the laws of India. Disputes will be handled by the courts at the registered place of business of ChefoTech, unless the law gives you the right to another forum.</p>
      </LegalSection>
      <LegalSection title="Changes and contact">
        <p>We may update these terms; the effective date at the top will change and organization owners will be notified inside the application about material changes. Continued use after a change means you accept the updated terms.</p>
        <ContactLine />
      </LegalSection>
    </LegalPage>
  );
}
