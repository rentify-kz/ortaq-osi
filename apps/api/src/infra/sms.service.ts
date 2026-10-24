import { Injectable, Logger } from '@nestjs/common'
import { env } from '../config/env'
import { MailerService } from './mailer.service'

/**
 * Отправка SMS за интерфейсом: провайдер меняется конфигурацией, бизнес-логика не знает вендора.
 * Пока договора с SMS-шлюзом нет, работает заглушка: в разработке SMS приходят письмом в Mailpit,
 * в тестах складываются в outbox. Реальный провайдер — новая реализация send(), без правок вызывающих.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('Sms')
  readonly outbox: { phone: string; text: string }[] = []

  constructor(private readonly mailer: MailerService) {}

  async send(phone: string, text: string): Promise<void> {
    if (env().NODE_ENV === 'test') {
      this.outbox.push({ phone, text })
      return
    }
    // Номер в лог не пишем целиком: это персональные данные
    this.log.log(`SMS на ${phone.slice(0, 5)}•••${phone.slice(-2)}`)
    await this.mailer.send({ to: `sms+${phone.replace('+', '')}@ortaq.local`, subject: `SMS для ${phone}`, text })
  }
}
