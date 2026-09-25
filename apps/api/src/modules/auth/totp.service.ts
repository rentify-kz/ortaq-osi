import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

const STEP_SEC = 30;
authenticator.options = { step: STEP_SEC, window: 1, digits: 6 };

@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret(20);
  }

  otpauthUrl(label: string, secret: string): string {
    return authenticator.keyuri(label, 'Ortaq', secret);
  }

  /**
   * Проверяет код и возвращает номер шага, которому он соответствует.
   * `null` — код неверен или уже использован (шаг не новее последнего принятого).
   */
  verify(code: string, secret: string, lastStep: number | null): number | null {
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) return null;
    const step = Math.floor(Date.now() / 1000 / STEP_SEC) + delta;
    if (lastStep !== null && step <= lastStep) return null;
    return step;
  }
}
