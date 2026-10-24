import { Injectable, Logger } from '@nestjs/common'
import { env } from '../config/env'

export type PushMessage = { title: string; body: string; data?: Record<string, string> }

/**
 * Push за интерфейсом, как SMS: FCM и APNs подключаются новой реализацией send().
 * Пока ключей нет, работает заглушка: в тестах сообщения складываются в outbox,
 * в разработке пишутся в лог без содержимого токенов.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger('Push')
  readonly outbox: { tokens: string[]; message: PushMessage }[] = []

  async send(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0) return
    if (env().NODE_ENV === 'test') {
      this.outbox.push({ tokens, message })
      return
    }
    this.log.log(`Push на ${tokens.length} устр.: «${message.title}»`)
  }
}
