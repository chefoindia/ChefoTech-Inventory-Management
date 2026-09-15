'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, FolderTree, Ruler, MoreHorizontal } from 'lucide-react';
import type { CategoryDto, UnitDto } from '@pharmaos/shared';
import { useCategories, useCreateCategory, useUpdateCategory, useArchiveCategory, useUnits, useUpdateUnit } from '@/features/catalog/api';
import { NewUnitDialog } from '@/features/catalog/product-form';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableSkeleton, EmptyState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function CatalogSettingsPage() {
  return (
    <>
      <PageHeader title="Categories & units" description="Organise the catalogue and define the units stock is counted and sold in." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <CategoriesCard />
        <UnitsCard />
      </div>
    </>
  );
}

function CategoriesCard() {
  const [showInactive, setShowInactive] = useState(false);
  const categories = useCategories(showInactive);
  const archive = useArchiveCategory();
  const canManage = usePermission('products.manageCategories');
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<CategoryDto | null>(null);
  const sorted = [...(categories.data ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div><CardTitle>Categories</CardTitle><CardDescription>Nested groups for reporting and filtering.</CardDescription></div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-fg-muted"><Checkbox checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive</label>
          {canManage ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> New</Button> : null}
        </div>
      </CardHeader>
      {categories.isPending ? <TableSkeleton rows={4} cols={3} /> : sorted.length === 0 ? <EmptyState icon={FolderTree} title="No categories" description="Group products by therapeutic class, form or supplier." className="py-8" /> : (
        <Table>
          <THead><TR><TH>Category</TH><TH numeric>Products</TH><TH>Status</TH>{canManage ? <TH className="w-10" /> : null}</TR></THead>
          <TBody>
            {sorted.map((c) => {
              const depth = (c.path.match(/\//g) ?? []).length;
              return (
                <TR key={c.id}>
                  <TD><span style={{ paddingLeft: depth * 16 }} className="block"><span className="font-medium">{c.name}</span>{c.description ? <span className="block text-[12px] text-fg-subtle">{c.description}</span> : null}</span></TD>
                  <TD numeric>{c.productCount ?? 0}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  {canManage ? <TD><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setEditing(c); setOpen(true); }}>Edit</DropdownMenuItem><DropdownMenuItem destructive disabled={c.status === 'archived'} onSelect={() => setArchiving(c)}>Archive</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TD> : null}
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} all={categories.data ?? []} />
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={`Archive ${archiving?.name}?`} description="Products keep their category but it no longer appears in pickers." confirmLabel="Archive" destructive loading={archive.isPending} onConfirm={() => { if (!archiving) return; archive.mutate(archiving.id, { onSuccess: () => { toast.success('Category archived'); setArchiving(null); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </Card>
  );
}

function CategoryDialog({ open, onOpenChange, category, all }: { open: boolean; onOpenChange: (o: boolean) => void; category: CategoryDto | null; all: CategoryDto[] }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (open) { setName(category?.name ?? ''); setParentId(category?.parentId ?? ''); setDescription(category?.description ?? ''); }
  }, [open, category]);
  const pending = create.isPending || update.isPending;
  const submit = () => {
    const input = { name, parentId: parentId || null, description };
    const fail = (e: unknown) => toast.error(errorMessage(e));
    if (category) update.mutate({ id: category.id, input }, { onSuccess: () => { toast.success('Category updated'); onOpenChange(false); }, onError: fail });
    else create.mutate(input, { onSuccess: () => { toast.success('Category created'); onOpenChange(false); }, onError: fail });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={category ? `Edit ${category.name}` : 'New category'} size="sm">
        <div className="space-y-4">
          <FormField label="Name" htmlFor="cat-name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></FormField>
          <FormField label="Parent" htmlFor="cat-parent"><Select value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">Top level</option>{all.filter((c) => c.id !== category?.id && c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.path || c.name}</option>)}</Select></FormField>
          <FormField label="Description" htmlFor="cat-desc"><Textarea className="min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        </div>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button loading={pending} disabled={!name.trim()} onClick={submit}>{category ? 'Save' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitsCard() {
  const [showInactive, setShowInactive] = useState(false);
  const units = useUnits(showInactive);
  const update = useUpdateUnit();
  const canCategories = usePermission('products.manageCategories');
  const canSettings = usePermission('settings.manage');
  const canManage = canCategories || canSettings;
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div><CardTitle>Units of measure</CardTitle><CardDescription>Base units (tablet, ml) and pack units (strip, bottle, box).</CardDescription></div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-fg-muted"><Checkbox checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive</label>
          {canManage ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> New</Button> : null}
        </div>
      </CardHeader>
      {units.isPending ? <TableSkeleton rows={4} cols={3} /> : !units.data?.length ? <EmptyState icon={Ruler} title="No units" className="py-8" /> : (
        <Table>
          <THead><TR><TH>Unit</TH><TH>Abbreviation</TH><TH>Decimals</TH><TH>Status</TH>{canManage ? <TH className="w-24" /> : null}</TR></THead>
          <TBody>
            {units.data.map((u: UnitDto) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.name}{u.isSystem ? <Badge className="ml-2" variant="neutral">System</Badge> : null}</TD>
                <TD>{u.abbreviation}</TD>
                <TD>{u.allowsDecimal ? 'Allowed' : 'Whole numbers'}</TD>
                <TD><StatusBadge status={u.status} /></TD>
                {canManage ? <TD>{!u.isSystem ? <Button variant="ghost" size="sm" loading={update.isPending} onClick={() => update.mutate({ id: u.id, input: { status: u.status === 'active' ? 'inactive' : 'active' } }, { onError: (e) => toast.error(errorMessage(e)) })}>{u.status === 'active' ? 'Disable' : 'Enable'}</Button> : null}</TD> : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <NewUnitDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
