import { z } from 'zod';

/** Формат ошибки API — docs/spec/03-api-contract.md §2. */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOTP: 'INVALID_TOTP',
  INVALID_TOKEN: 'INVALID_TOKEN',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  BREACHED_PASSWORD: 'BREACHED_PASSWORD',
  CSRF_HEADER_MISSING: 'CSRF_HEADER_MISSING',
  CHAIRMAN_ALREADY_ASSIGNED: 'CHAIRMAN_ALREADY_ASSIGNED',
  ORGANIZATION_BIN_TAKEN: 'ORGANIZATION_BIN_TAKEN',
  UNITS_LOCKED: 'UNITS_LOCKED',
  UNIT_LAYOUT_INVALID: 'UNIT_LAYOUT_INVALID',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
