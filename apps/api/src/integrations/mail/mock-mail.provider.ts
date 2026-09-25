import { Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from './mail.provider.js';

/** Заглушка: складывает письма в память и печатает в лог. Только для local и тестов. */
export class MockMailProvider implements MailProvider {
  private readonly logger = new Logger('MockMail');
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    this.logger.log(`to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
