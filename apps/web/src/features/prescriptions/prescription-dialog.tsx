'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { PrescriptionDto, AttachmentRef } from '@pharmaos/shared';
import { useCreatePrescription, useUpdatePrescription } from './api';
import { errorMessage } from '@/lib/api-client';
import { dateInput } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { CustomerPicker, ProductPicker } from '@/components/ui/pickers';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';

interface Item { key: string; medicine: string; dosage: string; duration: string; productId?: string }
const newItem = (): Item => ({ key: Math.random().toString(36).slice(2, 9), medicine: '', dosage: '', duration: '' });

export function PrescriptionDialog({ open, onOpenChange, prescription, defaultCustomerId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; prescription: PrescriptionDto | null; defaultCustomerId?: string; onSaved?: (p: PrescriptionDto) => void }) {
  const create = useCreatePrescription();
  const update = useUpdatePrescription();
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [doctorName, setDoctorName] = React.useState('');
  const [doctorRegNo, setDoctorRegNo] = React.useState('');
  const [hospital, setHospital] = React.useState('');
  const [date, setDate] = React.useState(dateInput(new Date()));
  const [validUntil, setValidUntil] = React.useState('');
  const [diagnosis, setDiagnosis] = React.useState('');
  const [items, setItems] = React.useState<Item[]>([newItem()]);
  const [files, setFiles] = React.useState<AttachmentRef[]>([]);
  const [notes, setNotes] = React.useState('');
  React.useEffect(() => {
    if (!open) return;
    if (prescription) {
      setCustomerId(prescription.customerId); setDoctorName(prescription.doctorName); setDoctorRegNo(prescription.doctorRegNo); setHospital(prescription.hospital); setDate(dateInput(prescription.prescriptionDate)); setValidUntil(prescription.validUntil ? dateInput(prescription.validUntil) : ''); setDiagnosis(prescription.diagnosis);
      setItems(prescription.items.length ? prescription.items.map((i) => ({ key: Math.random().toString(36).slice(2, 9), medicine: i.medicine, dosage: i.dosage, duration: i.duration, productId: i.productId ?? undefined })) : [newItem()]);
      setFiles(prescription.files as AttachmentRef[]); setNotes(prescription.notes);
    } else {
      setCustomerId(defaultCustomerId ?? null); setDoctorName(''); setDoctorRegNo(''); setHospital(''); setDate(dateInput(new Date())); setValidUntil(''); setDiagnosis(''); setItems([newItem()]); setFiles([]); setNotes('');
    }
  }, [open, prescription, defaultCustomerId]);
  const pending = create.isPending || update.isPending;
  const submit = () => {
    if (!customerId || !doctorName.trim() || !date) return toast.error('Customer, doctor and date are required.');
    const input = { customerId, doctorName, doctorRegNo, hospital, prescriptionDate: new Date(date), validUntil: validUntil ? new Date(validUntil) : undefined, diagnosis, items: items.filter((i) => i.medicine.trim()).map((i) => ({ medicine: i.medicine, dosage: i.dosage, duration: i.duration, productId: i.productId })), files, notes };
    const fail = (e: unknown) => toast.error(errorMessage(e));
    if (prescription) update.mutate({ id: prescription.id, input }, { onSuccess: (p) => { toast.success('Prescription updated'); onOpenChange(false); onSaved?.(p); }, onError: fail });
    else create.mutate(input, { onSuccess: (p) => { toast.success('Prescription saved'); onOpenChange(false); onSaved?.(p); }, onError: fail });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent title={prescription ? 'Edit prescription' : 'New prescription'} description="Attach a scan or photo and list the medicines so schedule-H sales can reference it." size="lg">
        <div className="space-y-4">
          <FormGrid>
            <FormField label="Customer" htmlFor="rx-cust" required className="sm:col-span-2"><CustomerPicker value={customerId} onChange={setCustomerId} disabled={!!prescription} /></FormField>
            <FormField label="Doctor" htmlFor="rx-doc" required><Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr Name" /></FormField>
            <FormField label="Registration no." htmlFor="rx-reg"><Input value={doctorRegNo} onChange={(e) => setDoctorRegNo(e.target.value)} /></FormField>
            <FormField label="Hospital / clinic" htmlFor="rx-hosp"><Input value={hospital} onChange={(e) => setHospital(e.target.value)} /></FormField>
            <FormField label="Diagnosis" htmlFor="rx-diag"><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></FormField>
            <FormField label="Prescription date" htmlFor="rx-date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
            <FormField label="Valid until" htmlFor="rx-valid"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></FormField>
          </FormGrid>
          <div>
            <div className="mb-1 text-[13px] font-medium">Medicines</div>
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_140px_120px_32px]">
                  <Input placeholder="Medicine as written" value={i.medicine} onChange={(e) => setItems((it) => it.map((x) => (x.key === i.key ? { ...x, medicine: e.target.value } : x)))} aria-label="Medicine" />
                  <ProductPicker value={i.productId ?? null} placeholder="Link to product (optional)" onChange={(id, p) => setItems((it) => it.map((x) => (x.key === i.key ? { ...x, productId: id ?? undefined, medicine: x.medicine || p?.name || '' } : x)))} />
                  <Input placeholder="Dosage (1-0-1)" value={i.dosage} onChange={(e) => setItems((it) => it.map((x) => (x.key === i.key ? { ...x, dosage: e.target.value } : x)))} aria-label="Dosage" />
                  <Input placeholder="Duration" value={i.duration} onChange={(e) => setItems((it) => it.map((x) => (x.key === i.key ? { ...x, duration: e.target.value } : x)))} aria-label="Duration" />
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setItems((it) => (it.length > 1 ? it.filter((x) => x.key !== i.key) : [newItem()]))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setItems((it) => [...it, newItem()])}><Plus className="h-3.5 w-3.5" /> Add medicine</Button>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-[13px] font-medium">Scans / photos</span><FileUpload purpose="prescription" multiple accept="image/*,.pdf" onUploaded={(refs) => setFiles((f) => [...f, ...refs].slice(0, 10))} label="Upload" /></div>
            <AttachmentList items={files} onRemove={(pid) => setFiles((f) => f.filter((x) => x.publicId !== pid))} />
          </div>
          <FormField label="Notes" htmlFor="rx-notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button loading={pending} onClick={submit}>{prescription ? 'Save changes' : 'Save prescription'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
