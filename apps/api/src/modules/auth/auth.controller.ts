import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
  passwordLoginBody, passwordSetBody, stepUpBody, twoFactorSetupBody, twoFactorVerifyBody,
  type PasswordLoginBody, type PasswordSetBody, type StepUpBody, type TwoFactorSetupBody, type TwoFactorVerifyBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { Public, Rate } from '../../common/decorators'
import { unauthenticated } from '../../common/errors'
import { ZodPipe } from '../../common/zod.pipe'
import { AuthService, type AuthOutcome } from './auth.service'
import { ACCESS_COOKIE, REFRESH_COOKIE, SessionsService } from './sessions.service'
import { TokensService } from './tokens.service'

/** Мобильный клиент хранит токены в Keychain/Keystore и получает их в теле ответа */
const isMobile = (req: Request) => req.header('x-client') === 'mobile'

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokensService,
  ) {}

  @Public() @Rate('auth') @Post('auth/password/login') @HttpCode(200)
  async login(@Body(new ZodPipe(passwordLoginBody)) body: PasswordLoginBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.passwordLogin(body.email, body.password), req, res)
  }

  @Public() @Rate('auth') @Post('auth/password/set') @HttpCode(200)
  async setPassword(@Body(new ZodPipe(passwordSetBody)) body: PasswordSetBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.setPassword(body.token, body.password), req, res)
  }

  @Public() @Rate('auth') @Post('auth/2fa/setup') @HttpCode(200)
  setup(@Body(new ZodPipe(twoFactorSetupBody)) body: TwoFactorSetupBody) {
    return this.auth.setupTwoFactor(body.challenge)
  }

  @Public() @Rate('auth') @Post('auth/2fa/enable') @HttpCode(200)
  async enable(@Body(new ZodPipe(twoFactorVerifyBody)) body: TwoFactorVerifyBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.enableTwoFactor(body.challenge, body.code), req, res)
  }

  @Public() @Rate('auth') @Post('auth/2fa/verify') @HttpCode(200)
  async verify(@Body(new ZodPipe(twoFactorVerifyBody)) body: TwoFactorVerifyBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.verifyTwoFactor(body.challenge, body.code), req, res)
  }

  @Public() @Rate('auth') @Post('auth/refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = isMobile(req)
      ? (req.body as { refresh_token?: string } | undefined)?.refresh_token
      : (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]
    try {
      const { tokens } = await this.sessions.rotate(presented)
      if (isMobile(req)) return tokens
      this.sessions.setCookies(res, tokens)
      return { status: 'OK' }
    } catch (e) {
      if (!isMobile(req)) this.sessions.clearCookies(res)
      throw e
    }
  }

  /** Выход отзывает всю семью сессии: украденный refresh этого устройства тоже перестаёт работать */
  @Public() @Post('auth/logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string> | undefined
    const access = cookies?.[ACCESS_COOKIE] ?? req.header('authorization')?.replace(/^Bearer /, '')
    if (access) {
      const claims = await this.tokens.verify(access, 'access').catch(() => null)
      await this.sessions.revokeBySid(claims?.sid)
    }
    this.sessions.clearCookies(res)
  }

  @Rate('auth') @Post('auth/step-up') @HttpCode(200)
  stepUp(@Body(new ZodPipe(stepUpBody)) body: StepUpBody) {
    return this.auth.stepUp(body.code)
  }

  @Get('me')
  me() {
    const userId = ctx().userId
    if (!userId) throw unauthenticated()
    return this.auth.me(userId)
  }

  private respond(outcome: AuthOutcome, req: Request, res: Response) {
    if (!outcome.tokens) return outcome.result
    if (isMobile(req)) return { ...outcome.result, ...outcome.tokens }
    this.sessions.setCookies(res, outcome.tokens)
    return outcome.result
  }
}
