import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { SessionClient } from '@prisma/client';
import {
  PasswordLoginRequest,
  type PasswordLoginResponse,
  PasswordSetRequest,
  RefreshRequest,
  type SessionResponse,
  StepUpRequest,
  type StepUpResponse,
  TotpSetupRequest,
  type TotpSetupResponse,
  TotpVerifyRequest,
} from '@ortaq/shared';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  CLIENT_HEADER,
  cookieOptions,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../../common/auth/cookies.js';
import { CurrentActor, NoRequestTx, Public, RateLimit } from '../../common/auth/decorators.js';
import { ACCESS_TTL_SEC } from '../../common/auth/token.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ZodPipe } from '../../common/http/zod.pipe.js';
import type { Actor } from '../../infra/db/request-context.js';
import { AuthService } from './auth.service.js';
import { type IssuedSession, SessionService } from './session.service.js';

/** docs/spec/03-api-contract.md §3. */
@Controller('auth')
@NoRequestTx()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('password/login')
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  login(@Body(new ZodPipe(PasswordLoginRequest)) body: PasswordLoginRequest, @Req() req: Request): Promise<PasswordLoginResponse> {
    return this.auth.passwordLogin(body.email, body.password, meta(req));
  }

  @Post('password/set')
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  setPassword(@Body(new ZodPipe(PasswordSetRequest)) body: PasswordSetRequest, @Req() req: Request): Promise<PasswordLoginResponse> {
    return this.auth.setPassword(body.token, body.password, meta(req));
  }

  @Post('2fa/setup')
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  setupTotp(@Body(new ZodPipe(TotpSetupRequest)) body: { challenge_token?: string }): Promise<TotpSetupResponse> {
    if (!body.challenge_token) throw AppError.unauthenticated();
    return this.auth.setupTotp(body.challenge_token);
  }

  @Post('2fa/verify')
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  async verifyTotp(
    @Body(new ZodPipe(TotpVerifyRequest)) body: TotpVerifyRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.verifyTotp(body.challenge_token, body.code, meta(req));
    return this.deliver(session, session.client, res);
  }

  @Post('refresh')
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  async refresh(
    @Body(new ZodPipe(RefreshRequest)) body: { refresh_token?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const token = body.refresh_token ?? fromCookie;
    if (!token) throw AppError.unauthenticated();
    try {
      const session = await this.sessions.rotate(token, meta(req));
      return this.deliver(session, body.refresh_token ? 'MOBILE' : 'WEB', res);
    } catch (e) {
      if (fromCookie) clearAuthCookies(res, this.config.COOKIE_SECURE);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(actor);
    clearAuthCookies(res, this.config.COOKIE_SECURE);
  }

  @Post('step-up')
  @RateLimit('auth')
  @HttpCode(200)
  async stepUp(@CurrentActor() actor: Actor, @Body(new ZodPipe(StepUpRequest)) body: StepUpRequest): Promise<StepUpResponse> {
    const { token, expiresAt } = await this.auth.stepUp(actor, body.code);
    return { step_up_token: token, expires_at: expiresAt.toISOString() };
  }

  /** Веб получает токены только в httpOnly cookie; мобильное — в теле, хранит в secure-store. */
  private deliver(session: IssuedSession, client: SessionClient, res: Response): SessionResponse {
    const base = { access_expires_at: session.accessExpiresAt.toISOString() };
    if (client === 'MOBILE') {
      return { ...base, access_token: session.accessToken, refresh_token: session.refreshToken };
    }
    const secure = this.config.COOKIE_SECURE;
    res.cookie(ACCESS_COOKIE, session.accessToken, cookieOptions(secure, ACCESS_TTL_SEC * 1000));
    res.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      cookieOptions(secure, session.refreshExpiresAt.getTime() - Date.now(), REFRESH_COOKIE_PATH),
    );
    return base;
  }
}

function meta(req: Request): { client: SessionClient; ip?: string; deviceInfo?: string } {
  return {
    client: req.header(CLIENT_HEADER)?.toLowerCase() === 'mobile' ? 'MOBILE' : 'WEB',
    ip: req.ip,
    deviceInfo: req.header('user-agent'),
  };
}
