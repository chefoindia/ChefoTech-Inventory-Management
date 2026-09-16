import Image from 'next/image';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * ChefoTech parent-brand mark: the network emblem followed by the name. The emblem is the file in
 * /public/brand (square, so it is drawn at the same width and height); setting
 * NEXT_PUBLIC_COMPANY_LOGO to an empty string leaves only the wordmark.
 */
export function ChefoTechMark({ className, size = 'md', wordmark = true }: { className?: string; size?: 'sm' | 'md' | 'lg'; wordmark?: boolean }) {
  const h = size === 'lg' ? 36 : size === 'sm' ? 16 : 22;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {SITE.companyLogo ? <Image src={SITE.companyLogo} alt={wordmark ? '' : SITE.company} width={h} height={h} className="shrink-0" style={{ width: h, height: h }} /> : null}
      {wordmark ? (
        <span className={cn('inline-flex items-baseline font-semibold tracking-tight text-fg', size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]')}>
          Chefo<span className="text-[#1f5fae]">Tech</span>
        </span>
      ) : null}
    </span>
  );
}

/** "A ChefoTech product" byline used under the product logo on public and auth screens. */
export function Byline({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] text-fg-subtle', className)}>
      A <ChefoTechMark size="sm" className="text-fg-muted" /> product
    </span>
  );
}
