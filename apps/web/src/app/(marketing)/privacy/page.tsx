import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection, ContactLine } from '@/components/marketing/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How ChefoTech collects, uses and protects information when you use the PharmaOS website and application.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" path="/privacy" effective="16 September 2026" intro="This policy explains what information PharmaOS collects, why, and the choices you have. It is written to describe how the product actually works.">
      <LegalSection title="Who we are">
        <p>PharmaOS is operated by ChefoTech (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the data controller for information about website visitors and account holders. Pharmacies that use PharmaOS are the controllers of the data they enter about their own customers, suppliers and staff; we process that data on their instructions to provide the service.</p>
      </LegalSection>
      <LegalSection title="Information we collect">
        <p><strong>Account information.</strong> When you create an organization we collect the organization name, your name, email address, an optional phone number and the GST state you choose. Passwords are stored only as salted hashes.</p>
        <p><strong>Data you enter.</strong> Products, stock, batches, sales, purchases, customers, suppliers, prescriptions, documents and settings that your organization records in the application. This may include personal data about your customers and staff, which you are responsible for collecting lawfully.</p>
        <p><strong>Usage and security information.</strong> Server logs with IP address, browser type, request identifiers and timestamps; login activity; and an audit log of actions taken inside your organization (who changed what and when). We use these to run the service securely and to show you your own audit trail.</p>
        <p><strong>Website enquiries.</strong> If you request a demo or contact us, we keep the name, email, phone, pharmacy name and message you send so we can respond.</p>
        <p><strong>Payments.</strong> Subscription payments are processed by Razorpay. We receive the payment status, order and payment identifiers and the amount; we do not receive or store card numbers.</p>
        <p><strong>Optional AI features.</strong> If your organization connects a Google Gemini API key, the questions you ask the assistant, the page context you share with it and any documents you upload for reading are sent to Google&apos;s Gemini API under your key and Google&apos;s terms. The key is encrypted at rest and never shown after saving. AI usage counts (tokens, feature, duration) are stored for your usage limits; the content of conversations is not stored by us beyond the request.</p>
      </LegalSection>
      <LegalSection title="How we use information">
        <ul className="list-disc space-y-1 pl-5">
          <li>To provide, operate and support PharmaOS, including sending transactional emails such as invitations, invoices, statements and alerts that your organization configures.</li>
          <li>To secure the service: authentication, rate limiting, fraud and abuse prevention, and the audit trail.</li>
          <li>To respond to enquiries and provide demos.</li>
          <li>To bill subscriptions and comply with tax and accounting obligations.</li>
          <li>To improve the product using aggregate, non-identifying usage information.</li>
        </ul>
        <p>We do not sell personal data and we do not use your organization&apos;s data for advertising.</p>
      </LegalSection>
      <LegalSection title="Cookies and local storage">
        <p>The application uses a secure, HTTP-only cookie to keep you signed in and browser storage for conveniences such as the bill you are typing at the counter. The public website sets no advertising cookies. If we enable a web analytics tool it is configured without personal identifiers where the tool allows it. See the <Link href="/cookies" className="font-medium text-primary-700 hover:underline">cookie policy</Link>.</p>
      </LegalSection>
      <LegalSection title="Service providers">
        <p>We use infrastructure and service providers to run PharmaOS, which may include cloud hosting and a managed database, file storage for uploaded documents and images, transactional email, SMS and WhatsApp delivery when your organization enables them, push notification delivery, Razorpay for payments and Google for optional AI features. Each provider processes data only to provide its service to us.</p>
      </LegalSection>
      <LegalSection title="Retention and deletion">
        <p>Your organization&apos;s data is kept for as long as the account is active. Financial documents may need to be retained to meet legal obligations. You can export your whole organization as a JSON archive from Settings at any time. To delete an organization or an account, contact us and we will confirm the request with the organization owner before acting on it. Website enquiries are kept for as long as needed to respond and follow up.</p>
      </LegalSection>
      <LegalSection title="Security">
        <p>Data is transmitted over HTTPS. Every request is scoped to your organization on the server, permissions are enforced by the API, passwords are hashed, sessions can be reviewed and revoked, and sensitive secrets such as AI keys are encrypted at rest. No system is perfectly secure; if you believe your account has been compromised, change your password and contact us.</p>
      </LegalSection>
      <LegalSection title="Your rights">
        <p>Depending on where you live you may have rights to access, correct, export or delete personal data, or to object to certain processing. Account holders can update their own details in the application. For other requests, contact us; if your request concerns data a pharmacy entered about you, we may refer you to that pharmacy as the controller.</p>
      </LegalSection>
      <LegalSection title="Children">
        <p>PharmaOS is a business tool for pharmacies and is not directed at children. Pharmacies are responsible for the customer records they keep.</p>
      </LegalSection>
      <LegalSection title="Changes">
        <p>We will post any changes to this policy on this page and update the effective date. Material changes will be announced inside the application to organization owners.</p>
        <ContactLine />
      </LegalSection>
    </LegalPage>
  );
}
