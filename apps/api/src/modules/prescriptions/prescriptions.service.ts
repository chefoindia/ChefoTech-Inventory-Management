import { Types } from 'mongoose';
import type { CreatePrescriptionInput, UpdatePrescriptionInput, PrescriptionDto, PrescriptionListQuery, AttachmentRef } from '@pharmaos/shared';
import { PrescriptionModel, type PrescriptionDoc } from '@/models/prescription.model';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { attachmentUrl } from '@/services/cloudinary.service';
import { userRefs, iso, isoNow } from '@/modules/common/refs';

async function toDtos(ctx: RequestContext, docs: PrescriptionDoc[]): Promise<PrescriptionDto[]> {
  const [customers, sales, who] = await Promise.all([
    CustomerModel.find(trustedFilter({ _id: { $in: docs.map((d) => d.customerId) } })).select('name phone').lean<Pick<CustomerDoc, '_id' | 'name' | 'phone'>[]>(),
    SaleModel.find(trustedFilter({ _id: { $in: docs.flatMap((d) => d.linkedSaleIds ?? []) } })).select('number completedAt').lean<Pick<SaleDoc, '_id' | 'number' | 'completedAt'>[]>(),
    userRefs(docs.map((d) => d.createdBy)),
  ]);
  const cMap = new Map(customers.map((c) => [String(c._id), c]));
  const sMap = new Map(sales.map((s) => [String(s._id), s]));
  const today = new Date();
  return docs.map((d) => {
    const c = cMap.get(String(d.customerId));
    const status = d.status === 'active' && d.validUntil && d.validUntil < today ? 'expired' : (d.status as PrescriptionDto['status']);
    return {
      id: String(d._id),
      customerId: String(d.customerId),
      customerName: c?.name ?? '',
      customerPhone: c?.phone ?? '',
      doctorName: d.doctorName,
      doctorRegNo: d.doctorRegNo ?? '',
      hospital: d.hospital ?? '',
      prescriptionDate: isoNow(d.prescriptionDate),
      validUntil: iso(d.validUntil),
      diagnosis: d.diagnosis ?? '',
      items: (d.items ?? []).map((i) => ({ medicine: i.medicine ?? '', dosage: i.dosage ?? '', duration: i.duration ?? '', productId: i.productId ? String(i.productId) : null })),
      files: (d.files ?? []) as PrescriptionDto['files'],
      notes: d.notes ?? '',
      linkedSales: (d.linkedSaleIds ?? []).map((id) => sMap.get(String(id))).filter(Boolean).map((s) => ({ id: String(s!._id), number: s!.number, date: isoNow(s!.completedAt) })),
      status,
      createdBy: who(d.createdBy),
      createdAt: isoNow(d.createdAt),
    };
  });
}

export async function listPrescriptions(ctx: RequestContext, query: PrescriptionListQuery) {
  const filter = orgFilter<PrescriptionDoc>(ctx, {
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : { status: { $ne: 'archived' } }),
    ...(query.from || query.to ? { prescriptionDate: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
    ...(query.q ? { $or: [{ doctorName: { $regex: query.q, $options: 'i' } }, { hospital: { $regex: query.q, $options: 'i' } }] } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([PrescriptionModel.find(filter).sort({ prescriptionDate: -1 }).skip(skip).limit(query.pageSize).lean<PrescriptionDoc[]>(), PrescriptionModel.countDocuments(filter)]);
  return { items: await toDtos(ctx, docs), meta: pageMeta(query, total) };
}

export async function getPrescription(ctx: RequestContext, id: string) {
  const doc = await PrescriptionModel.findOne(orgFilter<PrescriptionDoc>(ctx, { _id: id })).lean<PrescriptionDoc>();
  if (!doc) throw new NotFoundError('Prescription');
  return (await toDtos(ctx, [doc]))[0]!;
}

export async function createPrescription(ctx: RequestContext, input: CreatePrescriptionInput) {
  const customer = await CustomerModel.exists(orgFilter(ctx, { _id: input.customerId }));
  if (!customer) throw new NotFoundError('Customer');
  for (const f of input.files) if (f.access !== 'private') throw new BusinessRuleError('Prescription files must be uploaded as private documents');
  const doc = await PrescriptionModel.create({ organizationId: ctx.organizationId, ...input, createdBy: ctx.userId });
  await audit(ctx, { action: 'prescription.created', entityType: 'Prescription', entityId: doc._id, summary: `Added prescription from ${input.doctorName}`, metadata: { files: input.files.length } });
  return getPrescription(ctx, String(doc._id));
}

export async function updatePrescription(ctx: RequestContext, id: string, input: UpdatePrescriptionInput) {
  const doc = await PrescriptionModel.findOne(orgFilter<PrescriptionDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Prescription');
  if (input.files) for (const f of input.files) if (f.access !== 'private') throw new BusinessRuleError('Prescription files must be private');
  for (const [k, v] of Object.entries(input)) if (v !== undefined) doc.set(k, v);
  await doc.save();
  await audit(ctx, { action: 'prescription.updated', entityType: 'Prescription', entityId: doc._id, summary: `Updated prescription from ${doc.doctorName}` });
  return getPrescription(ctx, id);
}

/** Short-lived signed URL for a prescription file; access is audited because these are medical records. */
export async function fileUrl(ctx: RequestContext, id: string, publicId: string) {
  const doc = await PrescriptionModel.findOne(orgFilter<PrescriptionDoc>(ctx, { _id: id })).lean<PrescriptionDoc>();
  if (!doc) throw new NotFoundError('Prescription');
  const file = (doc.files as AttachmentRef[]).find((f) => f.publicId === publicId);
  if (!file) throw new NotFoundError('File');
  await audit(ctx, { action: 'prescription.fileViewed', entityType: 'Prescription', entityId: doc._id, summary: `Viewed prescription file ${file.originalName ?? publicId}` });
  return { url: attachmentUrl(file, { expiresInSeconds: 300 }), expiresInSeconds: 300 };
}

/** Called when a sale references prescriptions: links and marks single-use ones as used. */
export async function linkToSale(ctx: RequestContext, prescriptionIds: string[], saleId: Types.ObjectId) {
  if (!prescriptionIds.length) return;
  await PrescriptionModel.updateMany(orgFilter(ctx, { _id: { $in: prescriptionIds } }), { $addToSet: { linkedSaleIds: saleId } });
}
