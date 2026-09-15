import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api-client';

/** Map API validation details onto react-hook-form fields; returns true if any field was set. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  if (!(err instanceof ApiError)) return false;
  const fields = err.fieldErrors();
  let applied = false;
  for (const [field, message] of Object.entries(fields)) {
    setError(field as Path<T>, { type: 'server', message });
    applied = true;
  }
  return applied;
}
