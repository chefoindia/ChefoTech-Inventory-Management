import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.product} by ${SITE.company}`,
    short_name: SITE.product,
    description: SITE.description,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
