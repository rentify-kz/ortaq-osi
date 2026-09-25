import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

const ISSUER = 'ortaq-api';
export const ACCESS_TTL_SEC = 15 * 60;
export const CHALLENGE_TTL_SEC = 5 * 60;
export const STEP_UP_TTL_SEC = 5 * 60;

export interface AccessClaims {
  sub: string;
  sid: string;
  cli: 'WEB' | 'MOBILE';
  adm: boolean;
}

export interface ChallengeClaims {
  sub: string;
  /** VERIFY — ввести код TOTP; SETUP — впервые настроить TOTP. */
  purpose: 'VERIFY' | 'SETUP';
  cli: 'WEB' | 'MOBILE';
}

export interface StepUpClaims {
  sub: string;
  sid: string;
}

type Typ = 'access' | 'challenge' | 'stepup';

/** Краткоживущие JWT (HS256). Refresh-токены — не JWT, а случайные строки с хешем в БД. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.JWT_SECRET, 'base64');
  }

  signAccess(c: AccessClaims): Promise<string> {
    return this.sign('access', { sid: c.sid, cli: c.cli, adm: c.adm }, c.sub, ACCESS_TTL_SEC);
  }

  signChallenge(c: ChallengeClaims): Promise<string> {
    return this.sign('challenge', { purpose: c.purpose, cli: c.cli }, c.sub, CHALLENGE_TTL_SEC);
  }

  signStepUp(c: StepUpClaims): Promise<string> {
    return this.sign('stepup', { sid: c.sid }, c.sub, STEP_UP_TTL_SEC);
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    const p = await this.verify(token, 'access');
    if (!p || typeof p.sid !== 'string' || (p.cli !== 'WEB' && p.cli !== 'MOBILE')) return null;
    return { sub: p.sub!, sid: p.sid, cli: p.cli, adm: p.adm === true };
  }

  async verifyChallenge(token: string): Promise<ChallengeClaims | null> {
    const p = await this.verify(token, 'challenge');
    if (!p || (p.purpose !== 'VERIFY' && p.purpose !== 'SETUP') || (p.cli !== 'WEB' && p.cli !== 'MOBILE')) {
      return null;
    }
    return { sub: p.sub!, purpose: p.purpose, cli: p.cli };
  }

  async verifyStepUp(token: string): Promise<StepUpClaims | null> {
    const p = await this.verify(token, 'stepup');
    if (!p || typeof p.sid !== 'string') return null;
    return { sub: p.sub!, sid: p.sid };
  }

  private sign(typ: Typ, claims: Record<string, unknown>, sub: string, ttlSec: number): Promise<string> {
    return new SignJWT({ ...claims, typ })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(`${ttlSec}s`)
      .sign(this.key);
  }

  private async verify(token: string, typ: Typ) {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
      if (payload.typ !== typ || typeof payload.sub !== 'string') return null;
      return payload;
    } catch (e) {
      if (e instanceof joseErrors.JOSEError) return null;
      throw e;
    }
  }
}
