'use client';

import * as React from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import type { AttachmentPurpose, AttachmentRef } from '@pharmaos/shared';
import { attachmentUrl, FileUpload } from './file-upload';
import { Button } from './button';
import { cn } from '@/lib/utils';

/** Single-image field (logo, avatar): preview + upload/replace + remove. Emits a verified AttachmentRef or null. */
export function ImageField({ value, onChange, purpose, entityId, label = 'Upload image', shape = 'square', disabled, className }: { value: AttachmentRef | null | undefined; onChange: (ref: AttachmentRef | null) => void; purpose: AttachmentPurpose; entityId?: string; label?: string; shape?: 'square' | 'round'; disabled?: boolean; className?: string }) {
  const [url, setUrl] = React.useState<string | null>(value?.url ?? null);
  React.useEffect(() => {
    let alive = true;
    if (!value) { setUrl(null); return; }
    if (value.url) { setUrl(value.url); return; }
    attachmentUrl(value, 240).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [value]);
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className={cn('flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-subtle', shape === 'round' ? 'rounded-full' : 'rounded-[var(--radius-card)]')}>
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-fg-faint" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FileUpload purpose={purpose} entityId={entityId} accept="image/png,image/jpeg,image/webp,image/svg+xml" label={value ? 'Replace' : label} disabled={disabled} onUploaded={(refs) => refs[0] && onChange(refs[0])} />
        {value ? <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}><X className="h-3.5 w-3.5" /> Remove</Button> : null}
      </div>
    </div>
  );
}
