'use client';

import * as React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import type { z } from 'zod';
import { createProductSchema, DRUG_SCHEDULES, DOSAGE_FORMS, type CreateProductInput, type ProductDto } from '@pharmaos/shared';
import { useCreateProduct, useUpdateProduct, useCategories, useUnits, useCreateUnit } from './api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { MoneyInput, PercentInput, QtyInput } from '@/components/ui/money-input';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ColumnHint } from '@/components/ui/info-hint';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';

type FormValues = z.input<typeof createProductSchema>;

const GST_RATES = [0, 500, 1200, 1800, 2800];

function defaults(product: ProductDto | null, baseUnitId: string): FormValues {
  if (product) {
    return {
      name: product.name,
      brandName: product.brandName,
      genericName: product.genericName,
      composition: product.composition,
      manufacturer: product.manufacturer,
      categoryId: product.categoryId,
      dosageForm: product.dosageForm as FormValues['dosageForm'],
      strength: product.strength,
      packLabel: product.packLabel,
      hsnCode: product.hsnCode,
      tax: { rateBps: product.tax.rateBps, cessBps: product.tax.cessBps },
      schedule: product.schedule,
      requiresPrescription: product.requiresPrescription,
      baseUnitId: product.baseUnitId,
      pricingUnitId: product.pricingUnitId,
      units: product.units.map((u) => ({ unitId: u.unitId, factorToBase: u.factorToBase, isDefaultPurchase: u.isDefaultPurchase, isDefaultSale: u.isDefaultSale, allowLooseSale: u.allowLooseSale })),
      pricing: { mrpMinor: product.pricing.mrpMinor, sellingPriceMinor: product.pricing.sellingPriceMinor, purchasePriceMinor: product.pricing.purchasePriceMinor ?? 0 },
      stockRules: { ...product.stockRules },
      barcodes: product.barcodes.map((b) => ({ code: b.code, unitId: b.unitId, isPrimary: b.isPrimary, source: b.source })),
      rackLocation: product.rackLocation,
      tags: product.tags,
      notes: product.notes,
      customFields: product.customFields ?? {},
    };
  }
  return {
    name: '',
    brandName: '',
    genericName: '',
    composition: '',
    manufacturer: '',
    categoryId: null,
    dosageForm: 'tablet',
    strength: '',
    packLabel: '',
    hsnCode: '3004',
    tax: { rateBps: 1200, cessBps: 0 },
    schedule: 'none',
    requiresPrescription: false,
    baseUnitId,
    pricingUnitId: baseUnitId,
    units: baseUnitId ? [{ unitId: baseUnitId, factorToBase: 1, isDefaultPurchase: true, isDefaultSale: true, allowLooseSale: true }] : [],
    pricing: { mrpMinor: 0, sellingPriceMinor: 0, purchasePriceMinor: 0 },
    stockRules: { reorderLevelBase: 0, minStockBase: 0, maxStockBase: 0 },
    barcodes: [],
    rackLocation: '',
    tags: [],
    notes: '',
    customFields: {},
  };
}

export function ProductForm({ product, onSaved, onCancel }: { product: ProductDto | null; onSaved: (p: ProductDto) => void; onCancel: () => void }) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const categories = useCategories();
  const units = useUnits();
  const canCost = usePermission('products.viewCost');
  const canPricing = usePermission('products.managePricing') || !product;
  const canBarcodes = usePermission('products.manageBarcodes') || !product;
  const [newUnitOpen, setNewUnitOpen] = React.useState(false);

  const unitList = units.data ?? [];
  const defaultBase = unitList.find((u) => /tablet|piece|unit/i.test(u.name))?.id ?? unitList[0]?.id ?? '';

  const form = useForm<FormValues, unknown, CreateProductInput>({ resolver: zodResolver(createProductSchema), defaultValues: defaults(product, defaultBase) });
  React.useEffect(() => {
    if (!product && !form.getValues('baseUnitId') && defaultBase) {
      form.setValue('baseUnitId', defaultBase);
      form.setValue('pricingUnitId', defaultBase);
      form.setValue('units', [{ unitId: defaultBase, factorToBase: 1, isDefaultPurchase: true, isDefaultSale: true, allowLooseSale: true }]);
    }
  }, [defaultBase, product, form]);

  const unitsArr = useFieldArray({ control: form.control, name: 'units' });
  const barcodesArr = useFieldArray({ control: form.control, name: 'barcodes' });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;
  const baseUnitId = form.watch('baseUnitId');
  const watchedUnits = form.watch('units');
  const pricingUnitId = form.watch('pricingUnitId');
  const unitName = (id: string) => unitList.find((u) => u.id === id)?.name ?? '—';

  // keep exactly one base-unit row (factor 1); switching the base unit rewrites that row instead of adding another
  const prevBase = React.useRef(baseUnitId);
  React.useEffect(() => {
    if (!baseUnitId) return;
    const units = form.getValues('units');
    const already = units.findIndex((u) => u.unitId === baseUnitId);
    const oldIdx = units.findIndex((u) => u.unitId === prevBase.current);
    if (already >= 0) {
      if (units[already]!.factorToBase !== 1) form.setValue(`units.${already}.factorToBase`, 1);
      if (oldIdx >= 0 && oldIdx !== already && units[oldIdx]!.factorToBase === 1) unitsArr.remove(oldIdx);
    } else if (oldIdx >= 0) {
      form.setValue(`units.${oldIdx}.unitId`, baseUnitId);
      form.setValue(`units.${oldIdx}.factorToBase`, 1);
    } else {
      unitsArr.prepend({ unitId: baseUnitId, factorToBase: 1, isDefaultPurchase: units.length === 0, isDefaultSale: units.length === 0, allowLooseSale: true });
    }
    if (!units.some((u) => u.unitId === form.getValues('pricingUnitId')) && form.getValues('pricingUnitId') === prevBase.current) form.setValue('pricingUnitId', baseUnitId);
    prevBase.current = baseUnitId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUnitId]);

  const onSubmit = form.handleSubmit((values) => {
    const fail = (err: unknown) => { if (!applyServerErrors(err, form.setError)) toast.error(errorMessage(err)); };
    if (product) update.mutate({ id: product.id, input: values }, { onSuccess: (p) => { toast.success('Product updated'); onSaved(p); }, onError: fail });
    else create.mutate(values, { onSuccess: (p) => { toast.success('Product created'); onSaved(p); }, onError: fail });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle><CardDescription>What the product is called and how it is classified.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid>
            <FormField label="Product name" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2" info="The name your staff will search for at the counter and the name printed on the bill. Write it the way it appears on the pack, including the strength, for example “Montek LC Tablet”."><Input autoFocus {...form.register('name')} placeholder="e.g. Montek LC Tablet" /></FormField>
            <FormField label="Brand" htmlFor="brandName" error={errors.brandName?.message} info="The marketing name on its own, without the strength: “Montek”, “Dolo”, “Crocin”. Search also matches this, so a customer asking for the brand finds the product."><Input {...form.register('brandName')} /></FormField>
            <FormField label="Generic name / salt" htmlFor="genericName" error={errors.genericName?.message} info="The molecule, for example “Paracetamol”. Fill this in so you can find every brand of the same salt when a customer wants a cheaper substitute."><Input {...form.register('genericName')} /></FormField>
            <FormField label="Composition" htmlFor="composition" error={errors.composition?.message} className="sm:col-span-2" info="The full formula with strengths, exactly as printed on the pack: “Montelukast 10mg + Levocetirizine 5mg”. Useful for substitutes and for answering a customer’s question without opening the box."><Input {...form.register('composition')} placeholder="Montelukast 10mg + Levocetirizine 5mg" /></FormField>
            <FormField label="Manufacturer" htmlFor="manufacturer" error={errors.manufacturer?.message} info="Who makes it, for example “Sun Pharma”. Reports can be grouped by manufacturer, which helps when you negotiate with a distributor."><Input {...form.register('manufacturer')} /></FormField>
            <FormField label="Category" htmlFor="categoryId" info="Your own grouping, such as “Antibiotics” or “Baby care”. Only used for filtering and category-wise sales reports; it changes nothing about billing or stock.">
              <Select {...form.register('categoryId', { setValueAs: (v) => v || null })}>
                <option value="">Uncategorised</option>
                {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.path || c.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Dosage form" htmlFor="dosageForm" info="What shape the medicine takes: tablet, capsule, syrup, injection, cream, device. It is for searching and reporting, and it hints at the right units to use below.">
              <Select {...form.register('dosageForm')}>{DOSAGE_FORMS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
            </FormField>
            <FormField label="Strength" htmlFor="strength" info="How much active ingredient is in one unit, for example “650mg” or “5mg/5ml”. Keep it separate from the name so you can tell 500mg and 650mg apart at a glance."><Input {...form.register('strength')} placeholder="10mg" /></FormField>
            <FormField label="Pack label" htmlFor="packLabel" hint="Shown on bills, e.g. 1x10, 100ml." info={<><p>How the pack is described on the bill and in search results: “1x15”, “100 ml”, “50 strips”.</p><p>This is only a label. The number the system actually counts with is “Base units per” in the table below.</p></>}><Input {...form.register('packLabel')} /></FormField>
            <FormField label="Rack location" htmlFor="rackLocation" info="Where the box physically sits in your shop, for example “A-12”. It shows at the counter so a new helper can find the medicine without asking."><Input {...form.register('rackLocation')} placeholder="A-12" /></FormField>
            <FormField label="Schedule" htmlFor="schedule" hint="H, H1 and X require a prescription and appear in the schedule register." info={<><p>The drug schedule printed on the pack. H, H1 and X are prescription-only.</p><p>Choosing one of those makes the counter ask for a prescription before the sale can be completed, and the sale appears in your schedule register.</p></>}>
              <Select {...form.register('schedule', { onChange: (e) => { if (['H', 'H1', 'X', 'narcotic'].includes(e.target.value)) form.setValue('requiresPrescription', true); } })}>{DRUG_SCHEDULES.map((s) => <option key={s} value={s}>{s === 'none' ? 'Not scheduled' : s}</option>)}</Select>
            </FormField>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm"><Checkbox {...form.register('requiresPrescription')} /> Requires prescription</label>
            </div>
          </FormGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div><CardTitle>Units & pack sizes</CardTitle><CardDescription>Stock is tracked in the base unit. Add pack units (strip, box) with how many base units each contains.</CardDescription></div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setNewUnitOpen(true)}><Plus className="h-3.5 w-3.5" /> New unit</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormGrid>
            <FormField label="Base unit" htmlFor="baseUnitId" error={errors.baseUnitId?.message} required hint="Smallest sellable unit, e.g. tablet, ml, piece." info={<><p>The smallest thing you can hand to a customer: one tablet, one ml of syrup, one piece.</p><p>All stock is counted in this unit. If you keep 5 strips of 15 tablets, the system holds 75 tablets, so selling 2 loose tablets stays exact.</p><p>It cannot be changed once the product is saved, because existing stock is already counted in it.</p></>}>
              <Select {...form.register('baseUnitId')} disabled={!!product}>
                <option value="">Select…</option>
                {unitList.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </Select>
            </FormField>
            <FormField label="Pricing unit" htmlFor="pricingUnitId" error={errors.pricingUnitId?.message} required hint="MRP and prices below are per this unit." info={<><p>The unit your MRP is printed for. For a strip of 15 costing ₹45, the pricing unit is Strip and the MRP is 45.</p><p>The counter works out the price of one tablet from this, so loose sales come out right without you doing any arithmetic.</p></>}>
              <Select {...form.register('pricingUnitId')}>
                {watchedUnits.map((u) => <option key={u.unitId} value={u.unitId}>{unitName(u.unitId)}{u.unitId === baseUnitId ? ' (base)' : ''}</option>)}
              </Select>
            </FormField>
          </FormGrid>
          {typeof errors.units?.message === 'string' ? <p className="text-[12px] text-danger-600">{errors.units.message}</p> : null}
          <Table>
            <THead><TR>
              <TH><ColumnHint title="Unit">The name of this pack: the base unit itself, or a bigger one like Strip, Box or Bottle.</ColumnHint></TH>
              <TH numeric><ColumnHint title="Base units per">How many base units are inside one of this pack. A strip of 15 tablets is 15. A 100 ml bottle is 100. The base unit is always 1.</ColumnHint></TH>
              <TH><ColumnHint title="Default purchase">The unit that is pre-filled when you enter a supplier bill, because distributors sell you strips or boxes, not single tablets.</ColumnHint></TH>
              <TH><ColumnHint title="Default sale">The unit pre-filled at the counter. Staff can still switch to another unit for a loose sale.</ColumnHint></TH>
              <TH><ColumnHint title="Loose sale">Allow selling less than a full pack, like 3 tablets out of a strip. Turn it off for things that must go out whole, such as a sealed bottle.</ColumnHint></TH>
              <TH className="w-10" />
            </TR></THead>
            <TBody>
              {unitsArr.fields.map((f, i) => {
                const isBase = watchedUnits[i]?.unitId === baseUnitId;
                return (
                  <TR key={f.id}>
                    <TD>
                      <Select className="h-8 w-44" {...form.register(`units.${i}.unitId`)} disabled={isBase}>
                        {unitList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    </TD>
                    <TD numeric><Input type="number" min={1} className="h-8 w-24 text-right" disabled={isBase} {...form.register(`units.${i}.factorToBase`, { valueAsNumber: true })} /></TD>
                    <TD><Checkbox {...form.register(`units.${i}.isDefaultPurchase`)} /></TD>
                    <TD><Checkbox {...form.register(`units.${i}.isDefaultSale`)} /></TD>
                    <TD><Checkbox {...form.register(`units.${i}.allowLooseSale`)} /></TD>
                    <TD>{!isBase ? <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove unit" onClick={() => unitsArr.remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Button type="button" variant="secondary" size="sm" disabled={unitsArr.fields.length >= 8} onClick={() => unitsArr.append({ unitId: unitList.find((u) => !watchedUnits.some((w) => w.unitId === u.id))?.id ?? '', factorToBase: 10, isDefaultPurchase: false, isDefaultSale: false, allowLooseSale: true })}>
            <Plus className="h-3.5 w-3.5" /> Add pack unit
          </Button>
          <UnitSummary units={watchedUnits} baseUnitId={baseUnitId} pricingUnitId={pricingUnitId} unitName={unitName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing & tax</CardTitle><CardDescription>Prices are per pricing unit. Batches carry their own MRP; these are defaults for new stock.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-3">
            <FormField label="MRP" htmlFor="pricing.mrpMinor" error={errors.pricing?.mrpMinor?.message} info={<><p>Maximum retail price printed on the pack, for one pricing unit.</p><p>This is only the default for new stock. Each batch keeps the MRP it was actually bought at, so an old batch still bills at its own printed price.</p></>}>
              <Controller control={form.control} name="pricing.mrpMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} disabled={!canPricing} />} />
            </FormField>
            <FormField label="Selling price" htmlFor="pricing.sellingPriceMinor" error={errors.pricing?.sellingPriceMinor?.message} hint="Blank/0 sells at MRP." info="What you actually charge, if you give a standing discount off MRP. Leave it blank or zero to sell at MRP.">
              <Controller control={form.control} name="pricing.sellingPriceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} disabled={!canPricing} />} />
            </FormField>
            {canCost ? (
              <FormField label="Purchase price" htmlFor="pricing.purchasePriceMinor" error={errors.pricing?.purchasePriceMinor?.message} info="What you pay your distributor for one pricing unit, before GST. Used for margin and stock-value reports, and hidden from staff who do not have permission to see cost.">
                <Controller control={form.control} name="pricing.purchasePriceMinor" render={({ field }) => <MoneyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} disabled={!canPricing} />} />
              </FormField>
            ) : null}
            <FormField label="HSN code" htmlFor="hsnCode" error={errors.hsnCode?.message} info="The GST classification code from your supplier’s invoice. Most retail medicines are 3004. It prints on the bill and is grouped in the GST report your accountant files."><Input inputMode="numeric" {...form.register('hsnCode')} /></FormField>
            <FormField label="GST rate" htmlFor="tax.rateBps" error={errors.tax?.rateBps?.message} info={<><p>The GST percentage for this product. Most medicines are 12%; some items are 5% or 18%.</p><p>The bill splits it into CGST and SGST for a local sale, or IGST when the customer is in another state.</p></>}>
              <Select {...form.register('tax.rateBps', { valueAsNumber: true })}>{GST_RATES.map((r) => <option key={r} value={r}>{r / 100}%</option>)}</Select>
            </FormField>
            <FormField label="Cess" htmlFor="tax.cessBps" error={errors.tax?.cessBps?.message} info="An extra levy on top of GST. Almost no pharmacy item has one, so leave it at zero unless your supplier’s invoice shows cess.">
              <Controller control={form.control} name="tax.cessBps" render={({ field }) => <PercentInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} />
            </FormField>
          </FormGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stock rules</CardTitle><CardDescription>In base units. Reorder level drives low-stock alerts.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-3">
            <FormField label="Reorder level" htmlFor="stockRules.reorderLevelBase" error={errors.stockRules?.reorderLevelBase?.message} info={<><p>When stock falls to this number of base units, the product appears in your low-stock list and on the dashboard so you can order more.</p><p>Count in base units: for 10 strips of 15 tablets, enter 150.</p></>}>
              <Controller control={form.control} name="stockRules.reorderLevelBase" render={({ field }) => <QtyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} suffix={unitName(baseUnitId)} />} />
            </FormField>
            <FormField label="Minimum stock" htmlFor="stockRules.minStockBase" info="The floor you never want to go below, in base units. Kept for your own reference in stock reports; it does not block a sale.">
              <Controller control={form.control} name="stockRules.minStockBase" render={({ field }) => <QtyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} suffix={unitName(baseUnitId)} />} />
            </FormField>
            <FormField label="Maximum stock" htmlFor="stockRules.maxStockBase" info="The most you want on the shelf, in base units. Helps you avoid over-ordering slow items that may expire before they sell.">
              <Controller control={form.control} name="stockRules.maxStockBase" render={({ field }) => <QtyInput value={field.value} onChange={(v) => field.onChange(v ?? 0)} suffix={unitName(baseUnitId)} />} />
            </FormField>
          </FormGrid>
        </CardContent>
      </Card>

      {canBarcodes ? (
        <Card>
          <CardHeader><CardTitle>Barcodes</CardTitle><CardDescription>Manufacturer EAN/UPC codes, optionally per unit. Internal codes can be generated after saving.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {barcodesArr.fields.map((f, i) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2">
                <Input className="h-8 w-56 font-mono" placeholder="8901234567890" {...form.register(`barcodes.${i}.code`)} />
                <Select className="h-8 w-40" {...form.register(`barcodes.${i}.unitId`, { setValueAs: (v) => v || undefined })}>
                  <option value="">Any unit</option>
                  {watchedUnits.map((u) => <option key={u.unitId} value={u.unitId}>{unitName(u.unitId)}</option>)}
                </Select>
                <label className="flex items-center gap-1.5 text-[13px]"><Checkbox {...form.register(`barcodes.${i}.isPrimary`)} /> Primary</label>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove barcode" onClick={() => barcodesArr.remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                {errors.barcodes?.[i]?.code?.message ? <span className="text-[12px] text-danger-600">{errors.barcodes[i]?.code?.message}</span> : null}
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" disabled={barcodesArr.fields.length >= 10} onClick={() => barcodesArr.append({ code: '', isPrimary: barcodesArr.fields.length === 0, source: 'manufacturer' })}><Plus className="h-3.5 w-3.5" /> Add barcode</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>More</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Tags" htmlFor="tags" hint="Comma separated." info="Free labels for your own filtering, such as “fridge”, “fast moving” or “diabetic”. Separate them with commas.">
            <Controller control={form.control} name="tags" render={({ field }) => <Input value={(field.value ?? []).join(', ')} onChange={(e) => field.onChange(e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />} />
          </FormField>
          <FormField label="Notes" htmlFor="notes" info="Anything your team should know about this product: storage in the fridge, a distributor to prefer, or a warning about a look-alike pack. Staff see it on the product page, not on the customer’s bill."><Textarea {...form.register('notes')} /></FormField>
          <Controller control={form.control} name="customFields" render={({ field }) => <CustomFieldsForm entity="product" values={(field.value ?? {}) as Record<string, unknown>} onChange={field.onChange} entityId={product?.id} />} />
        </CardContent>
        <CardFooter>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}><Wand2 className="h-4 w-4" /> {product ? 'Save changes' : 'Create product'}</Button>
        </CardFooter>
      </Card>

      <NewUnitDialog open={newUnitOpen} onOpenChange={setNewUnitOpen} />
    </form>
  );
}

export function NewUnitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUnit();
  const [name, setName] = React.useState('');
  const [abbr, setAbbr] = React.useState('');
  const [decimal, setDecimal] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New unit" size="sm">
        <div className="space-y-4">
          <FormField label="Name" htmlFor="unit-name" required info="The unit as you say it out loud: Strip, Box, Bottle, Vial. It appears in the unit dropdowns for every product."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Strip" autoFocus /></FormField>
          <FormField label="Abbreviation" htmlFor="unit-abbr" required info="Short form used where space is tight, such as the bill and the stock table: “strp”, “btl”, “tab”."><Input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder="strp" maxLength={10} /></FormField>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={decimal} onChange={(e) => setDecimal(e.target.checked)} /> Allows decimal quantities (ml, g)</label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!name || !abbr} onClick={() => create.mutate({ name, abbreviation: abbr, allowsDecimal: decimal }, { onSuccess: () => { toast.success('Unit created'); onOpenChange(false); setName(''); setAbbr(''); }, onError: (err) => toast.error(errorMessage(err)) })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Turns the unit rows into one sentence in plain words. The pack/base relationship is the part of
 * this form owners get wrong most often, so it is spelled out with the numbers they just typed.
 */
function UnitSummary({
  units,
  baseUnitId,
  pricingUnitId,
  unitName,
}: {
  units: { unitId: string; factorToBase: number }[];
  baseUnitId: string;
  pricingUnitId: string;
  unitName: (id: string) => string;
}) {
  const base = units.find((u) => u.unitId === baseUnitId);
  if (!base || !baseUnitId) return null;
  const baseLabel = unitName(baseUnitId);
  const packs = units.filter((u) => u.unitId !== baseUnitId && u.unitId && u.factorToBase > 1);
  const priceLabel = pricingUnitId ? unitName(pricingUnitId) : baseLabel;
  const pricingFactor = units.find((u) => u.unitId === pricingUnitId)?.factorToBase ?? 1;

  const many = (n: number, word: string) => `${n} ${n === 1 ? word : /(s|x|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`}`;
  return (
    <div className="rounded-[var(--radius-control)] border border-primary-200 bg-primary-50 px-4 py-3 text-[13px] leading-relaxed text-primary-900">
      <p className="font-semibold">In plain words</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>Stock is counted in <strong>{many(2, baseLabel.toLowerCase()).replace('2 ', '')}</strong>.</li>
        {packs.map((p) => {
          const pack = unitName(p.unitId).toLowerCase();
          return (
            <li key={p.unitId}>
              1 <strong>{pack}</strong> = <strong>{many(p.factorToBase, baseLabel.toLowerCase())}</strong>, so selling {many(2, pack)} takes {many(p.factorToBase * 2, baseLabel.toLowerCase())} out of stock.
            </li>
          );
        })}
        {packs.length === 0 ? <li>No pack unit yet. Add one if you buy this in strips, boxes or bottles.</li> : null}
        <li>
          MRP and prices are per <strong>{priceLabel.toLowerCase()}</strong>
          {pricingFactor > 1 ? <>, so one {baseLabel.toLowerCase()} costs 1/{pricingFactor} of the {priceLabel.toLowerCase()} price</> : null}.
        </li>
      </ul>
    </div>
  );
}
