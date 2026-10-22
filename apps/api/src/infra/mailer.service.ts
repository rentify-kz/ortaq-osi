import { Injectable, Logger } from '@nestjs/common'
import { createTransport, type Transporter } from 'nodemailer'
import { env } from '../config/env'

export type Mail = { to: string; subject: string; text: string }

/**
 * Отправка писем. В разработке SMTP указывает на Mailpit (http://localhost:8035),
 * в тестах письма складываются в outbox и не уходят никуда.
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger('Mailer')
  private readonly transport: Transporter | null =
    env().NODE_ENV === 'test' ? null : createTransport(env().SMTP_URL)
  readonly outbox: Mail[] = []

  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      this.outbox.push(mail)
      return
    }
    try {
      await this.transport.sendMail({ from: env().MAIL_FROM, ...mail })
    } catch (e) {
      // Адрес получателя в лог не пишем: это персональные данные
      this.log.error(`Письмо «${mail.subject}» не отправлено: ${(e as Error).message}`)
      throw e
    }
  }
}
