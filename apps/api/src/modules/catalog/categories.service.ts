import { Types } from 'mongoose';
import type { CreateCategoryInput, UpdateCategoryInput, CategoryDto } from '@pharmaos/shared';
import { CategoryModel, type CategoryDoc } from '@/models/category.model';
import { ProductModel, normalizeName } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/lib/errors';
import { audit } from '@/services/audit.service';

export function toCategoryDto(c: CategoryDoc & { productCount?: number }): CategoryDto {
  return {
    id: String(c._id),
    name: c.name,
    parentId: c.parentId ? String(c.parentId) : null,
    path: c.path ?? c.name,
    description: c.description ?? '',
    productCount: c.productCount,
    status: (c.status ?? 'active') as CategoryDto['status'],
  };
}

export async function listCategories(ctx: RequestContext, includeInactive = false) {
  const cats = await CategoryModel.find(orgFilter<CategoryDoc>(ctx, includeInactive ? {} : { status: 'active' })).sort({ path: 1 }).lean<CategoryDoc[]>();
  const counts = await ProductModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { organizationId: ctx.organizationId, status: { $ne: 'archived' }, categoryId: { $ne: null } } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return cats.map((c) => toCategoryDto({ ...c, productCount: countMap.get(String(c._id)) ?? 0 }));
}

async function resolveParentPath(ctx: RequestContext, parentId: string | null | undefined): Promise<{ parent: CategoryDoc | null; depth: number }> {
  if (!parentId) return { parent: null, depth: 0 };
  const parent = await CategoryModel.findOne(orgFilter<CategoryDoc>(ctx, { _id: parentId, status: 'active' })).lean<CategoryDoc>();
  if (!parent) throw new NotFoundError('Parent category');
  const depth = (parent.path ?? '').split(' / ').length;
  if (depth >= 3) throw new BusinessRuleError('Categories can be nested at most three levels deep');
  return { parent, depth };
}

export async function createCategory(ctx: RequestContext, input: CreateCategoryInput) {
  const { parent } = await resolveParentPath(ctx, input.parentId);
  const nameNormalized = normalizeName(input.name);
  const clash = await CategoryModel.exists(orgFilter<CategoryDoc>(ctx, { parentId: parent?._id ?? null, nameNormalized }));
  if (clash) throw new ConflictError('A category with this name already exists here', [{ path: 'name', message: 'Already exists' }]);
  const cat = await CategoryModel.create({
    organizationId: ctx.organizationId,
    name: input.name,
    nameNormalized,
    parentId: parent?._id ?? null,
    path: parent ? `${parent.path} / ${input.name}` : input.name,
    description: input.description ?? '',
    createdBy: ctx.userId,
  });
  await audit(ctx, { action: 'category.created', entityType: 'Category', entityId: cat._id, summary: `Created category "${cat.path}"` });
  return toCategoryDto(cat.toObject() as CategoryDoc);
}

export async function updateCategory(ctx: RequestContext, id: string, input: UpdateCategoryInput) {
  const cat = await findOrgDocOrThrow(CategoryModel, ctx, id, 'Category');
  const before = toCategoryDto(cat.toObject() as CategoryDoc);

  let parent: CategoryDoc | null = null;
  let parentChanged = false;
  if (input.parentId !== undefined && String(input.parentId ?? '') !== String(cat.parentId ?? '')) {
    if (input.parentId && String(input.parentId) === String(cat._id)) throw new BusinessRuleError('A category cannot be its own parent');
    ({ parent } = await resolveParentPath(ctx, input.parentId));
    if (parent && (parent.path ?? '').startsWith(cat.path + ' / ')) throw new BusinessRuleError('Cannot move a category under its own child');
    parentChanged = true;
  } else if (cat.parentId) {
    parent = await CategoryModel.findById(cat.parentId).lean<CategoryDoc>();
  }

  const nameChanged = input.name !== undefined && normalizeName(input.name) !== cat.nameNormalized;
  if (nameChanged || parentChanged) {
    const nameNormalized = normalizeName(input.name ?? cat.name);
    const clash = await CategoryModel.exists(orgFilter<CategoryDoc>(ctx, { parentId: parent?._id ?? null, nameNormalized, _id: { $ne: cat._id } }));
    if (clash) throw new ConflictError('A category with this name already exists here', [{ path: 'name', message: 'Already exists' }]);
  }

  if (input.name !== undefined) {
    cat.name = input.name;
    cat.nameNormalized = normalizeName(input.name);
  }
  if (input.description !== undefined) cat.description = input.description;
  if (input.status !== undefined) cat.status = input.status;
  if (parentChanged) cat.parentId = parent?._id ?? null;

  const oldPath = cat.path;
  const newPath = parent ? `${parent.path} / ${cat.name}` : cat.name;
  cat.path = newPath;
  cat.updatedBy = ctx.userId;
  await cat.save();

  if (oldPath !== newPath) {
    // Re-path descendants.
    const children = await CategoryModel.find(orgFilter<CategoryDoc>(ctx, { path: { $regex: `^${escapeRegExp(oldPath)} / ` } }));
    for (const child of children) {
      child.path = newPath + child.path.slice(oldPath.length);
      await child.save();
    }
  }
  await audit(ctx, { action: 'category.updated', entityType: 'Category', entityId: cat._id, summary: `Updated category "${cat.path}"`, before, after: toCategoryDto(cat.toObject() as CategoryDoc) });
  return toCategoryDto(cat.toObject() as CategoryDoc);
}

export async function archiveCategory(ctx: RequestContext, id: string) {
  const cat = await findOrgDocOrThrow(CategoryModel, ctx, id, 'Category');
  const children = await CategoryModel.countDocuments(orgFilter(ctx, { parentId: cat._id, status: { $ne: 'archived' } }));
  if (children > 0) throw new BusinessRuleError('Archive or move the sub-categories first');
  const products = await ProductModel.countDocuments(orgFilter(ctx, { categoryId: cat._id, status: { $ne: 'archived' } }));
  if (products > 0) throw new BusinessRuleError(`${products} product(s) still use this category; reassign them first`);
  cat.status = 'archived';
  await cat.save();
  await audit(ctx, { action: 'category.archived', entityType: 'Category', entityId: cat._id, summary: `Archived category "${cat.path}"` });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
