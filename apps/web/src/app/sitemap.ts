import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { SOLUTIONS } from '@/content/solutions';

/** Public, indexable pages only. The application and share links are excluded (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'monthly') => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency, priority });
  return [
    page('/', 1, 'weekly'),
    page('/features', 0.9),
    page('/ai-pharmacy-assistant', 0.8),
    page('/pricing', 0.9),
    ...SOLUTIONS.map((s) => page(`/${s.slug}`, 0.8)),
    page('/faq', 0.7),
    page('/demo', 0.7),
    page('/contact', 0.6),
    page('/about', 0.5),
    page('/register', 0.6),
    page('/login', 0.3, 'yearly'),
    page('/privacy', 0.2, 'yearly'),
    page('/terms', 0.2, 'yearly'),
    page('/cookies', 0.2, 'yearly'),
  ];
}
