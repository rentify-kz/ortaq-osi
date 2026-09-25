import { z } from 'zod';
import { Email, Password, TotpCode } from './validators.js';
import { HouseRole, Locale } from './enums.js';

export const PasswordLoginRequest = z.object({ email: Email, password: z.string().min(1).max(256) });
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequest>;

/** Ответ на вход по паролю: сессия не выдаётся до второго фактора. */
export const PasswordLoginResponse = z.object({
  next: z.enum(['TOTP_VERIFY', 'TOTP_SETUP']),
  challenge_token: z.string(),
});
export type PasswordLoginResponse = z.infer<typeof PasswordLoginResponse>;

export const PasswordSetRequest = z.object({ token: z.string().min(20), password: Password });
export type PasswordSetRequest = z.infer<typeof PasswordSetRequest>;

export const TotpSetupRequest = z.object({ challenge_token: z.string().optional() });
export const TotpSetupResponse = z.object({ secret: z.string(), otpauth_url: z.string() });
export type TotpSetupResponse = z.infer<typeof TotpSetupResponse>;

export const TotpVerifyRequest = z.object({ challenge_token: z.string(), code: TotpCode });
export type TotpVerifyRequest = z.infer<typeof TotpVerifyRequest>;

/** Для мобильного клиента токены возвращаются в теле; веб получает их только в httpOnly cookie. */
export const SessionResponse = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  access_expires_at: z.string(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const RefreshRequest = z.object({ refresh_token: z.string().optional() });

export const StepUpRequest = z.object({ method: z.literal('TOTP'), code: TotpCode });
export type StepUpRequest = z.infer<typeof StepUpRequest>;
export const StepUpResponse = z.object({ step_up_token: z.string(), expires_at: z.string() });
export type StepUpResponse = z.infer<typeof StepUpResponse>;

export const MeResponse = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  full_name: z.string(),
  locale: Locale,
  is_platform_admin: z.boolean(),
  memberships: z.array(
    z.object({ house_id: z.string(), house_display_name: z.string(), role: HouseRole }),
  ),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const PatchMeRequest = z.object({ full_name: z.string().trim().min(2).max(200).optional(), locale: Locale.optional() });
export type PatchMeRequest = z.infer<typeof PatchMeRequest>;
