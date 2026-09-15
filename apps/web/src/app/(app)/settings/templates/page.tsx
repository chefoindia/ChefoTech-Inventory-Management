'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, FileText, MoreHorizontal, Star } from 'lucide-react';
import { DOCUMENT_TEMPLATE_TYPES, DOCUMENT_TEMPLATE_LABELS, type DocumentTemplateType, type TemplateDto } from '@pharmaos/shared';
import { useTemplates, useCreateTemplate, useSetDefaultTemplate, useRenameTemplate, useArchiveTemplate } from '@/features/documents/api';
import { useOutlets } from '@/features/outlets/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton, EmptyState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function TemplatesPage() {
  const router = useRouter();
  const templates = useTemplates();
  const outlets = useOutlets();
  const setDefault = useSetDefaultTemplate();
  const rename = useRenameTemplate();
  const archive = useArchiveTemplate();
  const canManage = usePermission('templates.manage');
  const [createOpen, setCreateOpen] = useState<DocumentTemplateType | null>(null);
  const [renaming, setRenaming] = useState<TemplateDto | null>(null);
  const [newName, setNewName] = useState('');
  const [archiving, setArchiving] = useState<TemplateDto | null>(null);
  const byType = new Map<DocumentTemplateType, TemplateDto[]>();
  for (const t of templates.data ?? []) byType.set(t.documentType, [...(byType.get(t.documentType) ?? []), t]);
  return (
    <>
      <PageHeader title="Document templates" description="Design how invoices, receipts, statements and labels print. Each document type has a default; duplicate it to customise." />
      {templates.isPending ? <TableSkeleton rows={6} cols={3} /> : (
        <div className="space-y-4">
          {DOCUMENT_TEMPLATE_TYPES.map((type) => {
            const list = byType.get(type) ?? [];
            return (
              <Card key={type}>
                <CardHeader className="flex-row items-center justify-between">
                  <div><CardTitle>{DOCUMENT_TEMPLATE_LABELS[type]}</CardTitle><CardDescription>{list.length} template{list.length === 1 ? '' : 's'}</CardDescription></div>
                  {canManage ? <Button variant="secondary" size="sm" onClick={() => setCreateOpen(type)}><Plus className="h-3.5 w-3.5" /> New from default</Button> : null}
                </CardHeader>
                {list.length === 0 ? <EmptyState icon={FileText} title="No template" className="py-6" /> : (
                  <ul className="divide-y divide-border">
                    {list.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <Link href={`/settings/templates/${t.id}`} className="min-w-0 flex-1 hover:underline">
                          <span className="font-medium">{t.name}</span>
                          <span className="ml-2 text-[12px] text-fg-subtle">v{t.currentVersion} · {formatDateTime(t.updatedAt)}{t.outletId ? ` · ${outlets.data?.find((o) => o.id === t.outletId)?.name ?? 'outlet'}` : ''}</span>
                        </Link>
                        {t.isDefault ? <Badge variant="primary"><Star className="h-3 w-3" /> Default</Badge> : null}
                        {t.isSystem ? <Badge variant="neutral">System</Badge> : null}
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/settings/templates/${t.id}`)}>{canManage ? 'Design' : 'View'}</Button>
                        {canManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Template actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem disabled={t.isDefault} onSelect={() => setDefault.mutate(t.id, { onSuccess: () => toast.success('Default template updated'), onError: (e) => toast.error(errorMessage(e)) })}>Set as default</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => { setRenaming(t); setNewName(t.name); }}>Rename</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setCreateOpen(t.documentType)}>Duplicate…</DropdownMenuItem>
                              <DropdownMenuItem destructive disabled={t.isSystem || t.isDefault} onSelect={() => setArchiving(t)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <CreateTemplateDialog type={createOpen} onClose={() => setCreateOpen(null)} existing={(createOpen && byType.get(createOpen)) || []} onCreated={(t) => router.push(`/settings/templates/${t.id}`)} />
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent title="Rename template" size="sm">
          <FormField label="Name" htmlFor="tpl-name"><Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></FormField>
          <DialogFooter><Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button loading={rename.isPending} disabled={!newName.trim()} onClick={() => renaming && rename.mutate({ id: renaming.id, name: newName }, { onSuccess: () => { toast.success('Renamed'); setRenaming(null); }, onError: (e) => toast.error(errorMessage(e)) })}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={`Delete “${archiving?.name}”?`} description="Documents already generated keep their stored PDF. The template is removed from pickers." confirmLabel="Delete" destructive loading={archive.isPending} onConfirm={() => { if (!archiving) return; archive.mutate(archiving.id, { onSuccess: () => { toast.success('Template deleted'); setArchiving(null); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}

function CreateTemplateDialog({ type, onClose, existing, onCreated }: { type: DocumentTemplateType | null; onClose: () => void; existing: TemplateDto[]; onCreated: (t: TemplateDto) => void }) {
  const create = useCreateTemplate();
  const outlets = useOutlets();
  const [name, setName] = useState('');
  const [cloneFromId, setCloneFromId] = useState('');
  const [outletId, setOutletId] = useState('');
  const open = !!type;
  const source = existing.find((t) => t.id === cloneFromId) ?? existing.find((t) => t.isDefault) ?? existing[0];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`New ${type ? DOCUMENT_TEMPLATE_LABELS[type].toLowerCase() : ''} template`} description="Starts as a copy of an existing template; you can then move, style and add elements." size="sm">
        <div className="space-y-4">
          <FormField label="Name" htmlFor="new-tpl-name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Counter receipt with logo" autoFocus /></FormField>
          <FormField label="Copy from" htmlFor="new-tpl-src"><Select value={cloneFromId || source?.id || ''} onChange={(e) => setCloneFromId(e.target.value)}>{existing.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}</Select></FormField>
          <FormField label="Outlet" htmlFor="new-tpl-outlet" hint="Optional: use this template only at one outlet."><Select value={outletId} onChange={(e) => setOutletId(e.target.value)}><option value="">All outlets</option>{(outlets.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={!name.trim() || !source || !type} onClick={() => type && source && create.mutate({ documentType: type, name, outletId: outletId || null, layout: source.layout, cloneFromId: source.id }, { onSuccess: (t) => { toast.success('Template created'); onClose(); onCreated(t); }, onError: (e) => toast.error(errorMessage(e)) })}>Create & open designer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
