import type { ApiErrorCode, ApiErrorDetail } from '@pharmaos/shared';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetail[];
  readonly expose: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    options: { details?: ApiErrorDetail[]; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: ApiErrorDetail[]) {
    super('VALIDATION_ERROR', message, 400, { details });
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', code: ApiErrorCode = 'UNAUTHENTICATED') {
    super(code, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super('NOT_FOUND', `${entity} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: ApiErrorDetail[]) {
    super('CONFLICT', message, 409, { details });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: ApiErrorDetail[]) {
    super('BUSINESS_RULE', message, 422, { details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super('RATE_LIMITED', message, 429);
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string) {
    super('PLAN_LIMIT', message, 402);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Something went wrong', cause?: unknown) {
    super('INTERNAL', message, 500, { expose: false, cause });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
