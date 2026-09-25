import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from './mail.provider.js';

export class SmtpMailProvider implements MailProvider {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
  }
}
