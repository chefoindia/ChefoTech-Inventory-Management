import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { withTransaction } from '@/db/transaction';
import { nextDocumentNumber, financialYearKey, formatDocumentNumber } from '@/services/sequence.service';
import { OrganizationModel } from '@/models/organization.model';

describe('document numbering', () => {
  it('computes financial-year keys', () => {
    expect(financialYearKey(new Date('2026-09-15'), 4)).toBe('2026-27');
    expect(financialYearKey(new Date('2027-02-01'), 4)).toBe('2026-27');
    expect(financialYearKey(new Date('2027-04-01'), 4)).toBe('2027-28');
    expect(financialYearKey(new Date('2026-09-15'), 1)).toBe('2026');
    expect(formatDocumentNumber('INV', '2026-27', 7, 6)).toBe('INV-202627-000007');
    expect(formatDocumentNumber('', null, 7, 4)).toBe('0007');
  });

  it('hands out gapless unique numbers under concurrency and rolls back with the transaction', async () => {
    const userId = new Types.ObjectId();
    const org = await OrganizationModel.create({
      name: 'Seq Org', slug: 'seq-org', tax: { stateCode: '27' }, createdBy: userId,
      settings: { numbering: { sale: { prefix: 'INV', padding: 4, resetOnFinancialYear: false, perOutlet: true } } },
    });
    const outletId = new Types.ObjectId();

    const numbers = await Promise.all(
      Array.from({ length: 12 }, () => withTransaction((s) => nextDocumentNumber(org._id, outletId, 'sale', s))),
    );
    const values = numbers.map((n) => n.sequence).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(numbers.find((n) => n.sequence === 1)!.number).toBe('INV-0001');
    expect(new Set(numbers.map((n) => n.number)).size).toBe(12);

    // A failed transaction does not consume a number.
    await expect(
      withTransaction(async (s) => {
        await nextDocumentNumber(org._id, outletId, 'sale', s);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const next = await withTransaction((s) => nextDocumentNumber(org._id, outletId, 'sale', s));
    expect(next.sequence).toBe(13);

    // Different outlet and document type have independent sequences.
    const other = await withTransaction((s) => nextDocumentNumber(org._id, new Types.ObjectId(), 'sale', s));
    expect(other.sequence).toBe(1);
    const grn = await withTransaction((s) => nextDocumentNumber(org._id, outletId, 'grn', s));
    expect(grn.number).toBe('GRN-000001');
  });
});
