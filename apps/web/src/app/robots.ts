import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/** Marketing pages are crawlable; the signed-in application, invitations and signed share links are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/sales', '/purchases', '/inventory', '/products', '/customers', '/suppliers', '/prescriptions', '/reports', '/notifications', '/settings', '/share/', '/invite/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
