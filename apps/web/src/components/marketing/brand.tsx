import Image from 'next/image';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * ChefoTech parent-brand mark. Uses the real logo file when NEXT_PUBLIC_COMPANY_LOGO points to one
 * in /public; otherwise a restrained typographic wordmark so no brand asset is invented.
 */
export function ChefoTechMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 32 : size === 'sm' ? 18 : 22;
  if (SITE.companyLogo) {
    return <Image src={SITE.companyLogo} alt={SITE.company} height={h} width={h * 4} className={cn('w-auto', className)} style={{ height: h }} />;
  }
  return (
    <span className={cn('inline-flex items-baseline font-semibold tracking-tight text-fg', size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]', className)} aria-label={SITE.company}>
      Chefo<span className="text-primary-600">Tech</span>
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
