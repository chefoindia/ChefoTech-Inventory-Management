import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Analytics } from '@/components/analytics';
import { SITE, SITE_URL, og } from '@/lib/site';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.product} · Pharmacy Management Software by ${SITE.company}`, template: `%s · ${SITE.product}` },
  description: SITE.description,
  applicationName: SITE.product,
  authors: [{ name: SITE.company, url: SITE.companyUrl ?? SITE_URL }],
  creator: SITE.company,
  publisher: SITE.company,
  keywords: ['pharmacy management software', 'pharmacy billing software', 'pharmacy inventory management', 'pharmacy POS', 'medicine inventory software', 'batch and expiry management', 'pharmacy software for multiple outlets', 'GST pharmacy billing', 'AI pharmacy management'],
  ...og(`${SITE.product} · ${SITE.tagline}`, SITE.description, '/'),
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  ...(SITE.googleVerification ? { verification: { google: SITE.googleVerification } } : {}),
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
