'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Save, Eye, History, Star, RotateCcw } from 'lucide-react';
import { DOCUMENT_TEMPLATE_LABELS, type TemplateLayout } from '@pharmaos/shared';
import { useTemplate, useTemplateCatalogue, useSaveTemplateVersion, useRestoreTemplateVersion, useSetDefaultTemplate, previewTemplate } from '@/features/documents/api';
import { TemplateDesigner } from '@/features/documents/designer';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function TemplateDesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const template = useTemplate(id);
  const catalogue = useTemplateCatalogue();
  const save = useSaveTemplateVersion();
  const restore = useRestoreTemplateVersion();
  const setDefault = useSetDefaultTemplate();
  const canManage = usePermission('templates.manage');
  const [layout, setLayout] = useState<TemplateLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [note, setNote] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => { if (template.data && !dirty) setLayout(template.data.layout); }, [template.data, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (template.isPending || catalogue.isPending || !layout) return <Spinner />;
  if (template.isError) return <ErrorState message={errorMessage(template.error)} onRetry={() => template.refetch()} />;
  if (catalogue.isError) return <ErrorState message={errorMessage(catalogue.error)} onRetry={() => catalogue.refetch()} />;
  const t = template.data;
  const readOnly = !canManage;

  const preview = async () => {
    setPreviewing(true);
    try { const blob = await previewTemplate(t.documentType, layout); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(blob)); } catch (e) { toast.error(errorMessage(e)); } finally { setPreviewing(false); }
  };

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-64px)] flex-col sm:-mx-6 lg:-mx-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <Link href="/settings/templates" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><span className="truncate">{t.name}</span>{t.isDefault ? <Badge variant="primary"><Star className="h-3 w-3" /> Default</Badge> : null}{t.isSystem ? <Badge>System</Badge> : null}{dirty ? <Badge variant="warning">Unsaved</Badge> : null}</div>
          <div className="text-[12px] text-fg-subtle">{DOCUMENT_TEMPLATE_LABELS[t.documentType]} · version {t.currentVersion}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" loading={previewing} onClick={() => void preview()}><Eye className="h-3.5 w-3.5" /> Preview PDF</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="sm"><History className="h-3.5 w-3.5" /> Versions</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Saved versions</DropdownMenuLabel>
              {[...t.versions].reverse().map((v) => (
                <DropdownMenuItem key={v.id} disabled={!canManage || v.version === t.currentVersion} onSelect={() => restore.mutate({ id: t.id, version: v.version }, { onSuccess: () => { setDirty(false); toast.success(`Restored version ${v.version}`); }, onError: (e) => toast.error(errorMessage(e)) })}>
                  <span className="flex-1"><span className="font-medium">v{v.version}</span> {v.note ? `· ${v.note}` : ''}<span className="block text-[11px] text-fg-subtle">{formatDateTime(v.createdAt)} · {v.createdBy?.name ?? '—'}</span></span>
                  {v.version === t.currentVersion ? <Badge variant="primary">Current</Badge> : <RotateCcw className="h-3.5 w-3.5 text-fg-subtle" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={t.isDefault || !canManage} onSelect={() => setDefault.mutate(t.id, { onSuccess: () => toast.success('Set as default'), onError: (e) => toast.error(errorMessage(e)) })}><Star className="h-3.5 w-3.5" /> Use as default</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canManage ? <Button size="sm" disabled={!dirty} onClick={() => setSaveOpen(true)}><Save className="h-3.5 w-3.5" /> Save version</Button> : null}
        </div>
      </div>
      <div className="flex-1 p-3">
        <TemplateDesigner layout={layout} onChange={(l) => { setLayout(l); setDirty(true); }} catalogue={catalogue.data} documentType={t.documentType} readOnly={readOnly} />
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent title="Save a new version" description="Previous versions stay available for restore. Documents generated earlier keep the version they used." size="sm">
          <FormField label="Change note" htmlFor="ver-note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added GSTIN and licence number" autoFocus /></FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate({ id: t.id, layout, note }, { onSuccess: (res) => { setDirty(false); setSaveOpen(false); setNote(''); toast.success(`Saved as version ${res.currentVersion}`); }, onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o && previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
        <DialogContent title="Preview" description="Rendered with sample data by the same engine that prints real documents." size="xl" className="h-[90vh] max-h-[90vh] top-[5vh]">
          {previewUrl ? <iframe title="Template preview" src={previewUrl} className="h-[75vh] w-full rounded border border-border" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
