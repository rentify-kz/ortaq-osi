import { Injectable } from '@nestjs/common'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'

/** Окно ±1 шаг (30 секунд): терпимо к расхождению часов телефона, но не шире */
authenticator.options = { window: 1 }

@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret()
  }

  check(code: string, secret: string): boolean {
    return authenticator.check(code, secret)
  }

  /** Для тестов и сида: текущий код по секрету */
  generate(secret: string): string {
    return authenticator.generate(secret)
  }

  async enrollment(label: string, secret: string) {
    const otpauth_url = authenticator.keyuri(label, 'Ortaq', secret)
    const qr_data_url = await QRCode.toDataURL(otpauth_url, { margin: 1, width: 240 })
    return { secret, otpauth_url, qr_data_url }
  }
}
