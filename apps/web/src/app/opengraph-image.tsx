import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = `${SITE.product} · ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview generated at build time; no external assets needed. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%)', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 40, fontWeight: 700 }}>+</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{SITE.product}</div>
          <div style={{ marginLeft: 12, fontSize: 22, color: '#475569' }}>{`A ${SITE.company} product`}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Modern pharmacy management, simplified.</div>
          <div style={{ fontSize: 28, color: '#475569', lineHeight: 1.35 }}>Billing · Inventory with batches & expiry · Purchases · Customer credit · GST · Reports · Multi-outlet · AI assistant</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#64748b' }}>
          <div>Free 14-day trial · No card required</div>
          <div>{SITE.url.replace(/^https?:\/\//, '')}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
