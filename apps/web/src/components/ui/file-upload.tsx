'use client';

import * as React from 'react';
import { Upload, FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AttachmentPurpose, AttachmentRef, SignedUploadDto } from '@pharmaos/shared';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** Direct-to-Cloudinary upload: sign → upload → confirm. Returns a verified AttachmentRef. */
export async function uploadFile(file: File, purpose: AttachmentPurpose, entityId?: string): Promise<AttachmentRef & { url?: string }> {
  const signed = await api.post<SignedUploadDto>('/attachments/sign-upload', { purpose, fileName: file.name, mimeType: file.type || 'application/octet-stream', bytes: file.size, entityId });
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  form.append('public_id', signed.publicId);
  form.append('type', signed.type);
  form.append('allowed_formats', signed.allowedFormats.join(','));
  const res = await fetch(signed.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? 'Upload failed');
  }
  const uploaded = (await res.json()) as { public_id: string };
  return api.post<AttachmentRef & { url?: string }>('/attachments/confirm', { purpose, publicId: uploaded.public_id, originalName: file.name });
}

export async function attachmentUrl(ref: AttachmentRef, width?: number): Promise<string> {
  const res = await api.get<{ url: string }>('/attachments/url', { publicId: ref.publicId, resourceType: ref.resourceType, access: ref.access, width });
  return res.url;
}

export function FileUpload({
  purpose,
  entityId,
  accept,
  multiple = false,
  onUploaded,
  label = 'Upload file',
  className,
  disabled,
}: {
  purpose: AttachmentPurpose;
  entityId?: string;
  accept?: string;
  multiple?: boolean;
  onUploaded: (refs: (AttachmentRef & { url?: string })[]) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handle = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const refs: (AttachmentRef & { url?: string })[] = [];
      for (const f of Array.from(files).slice(0, multiple ? 10 : 1)) refs.push(await uploadFile(f, purpose, entityId));
      onUploaded(refs);
      toast.success(refs.length === 1 ? 'File uploaded' : `${refs.length} files uploaded`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => void handle(e.target.files)} />
      <Button type="button" variant="secondary" size="sm" loading={busy} disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {label}
      </Button>
    </div>
  );
}

export function AttachmentList({ items, onRemove, onOpen }: { items: AttachmentRef[]; onRemove?: (publicId: string) => void; onOpen?: (ref: AttachmentRef) => void }) {
  const [opening, setOpening] = React.useState<string | null>(null);
  if (!items.length) return <p className="text-[13px] text-fg-subtle">No files attached.</p>;
  const open = async (ref: AttachmentRef) => {
    if (onOpen) return onOpen(ref);
    setOpening(ref.publicId);
    try {
      const url = await attachmentUrl(ref);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border">
      {items.map((a) => (
        <li key={a.publicId} className="flex items-center gap-3 px-3 py-2 text-sm">
          {a.resourceType === 'image' ? <ImageIcon className="h-4 w-4 text-fg-subtle" /> : <FileText className="h-4 w-4 text-fg-subtle" />}
          <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => void open(a)}>
            {a.originalName || a.publicId.split('/').pop()}
          </button>
          <span className="text-[12px] text-fg-subtle">{Math.round(a.bytes / 1024)} KB</span>
          {opening === a.publicId ? <Loader2 className="h-4 w-4 animate-spin text-fg-faint" /> : null}
          {onRemove ? (
            <button type="button" aria-label="Remove file" className={cn('rounded p-1 text-fg-faint hover:bg-surface-subtle hover:text-danger-600')} onClick={() => onRemove(a.publicId)}>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
