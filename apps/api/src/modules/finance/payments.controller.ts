import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import {
  confirmPaymentBody, manualPaymentBody, paymentListQuery, paymentSettingsBody, rejectPaymentBody, scanReceiptBody, submitPaymentBody,
  type ConfirmPaymentBody, type ManualPaymentBody, type PaymentListQuery, type PaymentSettingsBody, type RejectPaymentBody,
  type ScanReceiptBody, type SubmitPaymentBody,
} from '@ortaq/shared'
import { HouseScope, Rate, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { PaymentsService } from './payments.service'
import { ReceiptsService } from './receipts.service'

const MEMBERS = ['CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT'] as const

/** Оплаты и чеки, docs/03 §13–14. Подтверждение и реквизиты — со step-up: это деньги и их адрес */
@Controller('houses/:houseId')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
  ) {}

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('payment-settings')
  settings() {
    return this.payments.settings()
  }

  @HouseScope('CHAIRMAN') @StepUp() @Put('payment-settings')
  updateSettings(@Body(new ZodPipe(paymentSettingsBody)) body: PaymentSettingsBody) {
    return this.payments.updateSettings(body)
  }

  /** Своё начисление: собственность проверяет сервис */
  @HouseScope(...MEMBERS) @Get('charges/:chargeId/payment-link')
  link(@Param('chargeId', ParseUUIDPipe) chargeId: string) {
    return this.payments.link(chargeId)
  }

  @HouseScope(...MEMBERS) @Rate('upload') @Post('charges/:chargeId/payments')
  submit(@Param('chargeId', ParseUUIDPipe) chargeId: string, @Body(new ZodPipe(submitPaymentBody)) body: SubmitPaymentBody) {
    return this.payments.submit(chargeId, body)
  }

  @HouseScope(...MEMBERS) @Get('my-payments')
  mine() {
    return this.payments.mine()
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('payments')
  list(@Query(new ZodPipe(paymentListQuery)) q: PaymentListQuery) {
    return this.payments.list(q)
  }

  /** Правление — любую; плательщик — свою. Различает сервис */
  @HouseScope(...MEMBERS) @Get('payments/:paymentId')
  detail(@Param('paymentId', ParseUUIDPipe) id: string) {
    return this.payments.detail(id)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('payments')
  manual(@Body(new ZodPipe(manualPaymentBody)) body: ManualPaymentBody) {
    return this.payments.manual(body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('payments/:paymentId/confirm') @HttpCode(200)
  confirm(@Param('paymentId', ParseUUIDPipe) id: string, @Body(new ZodPipe(confirmPaymentBody)) body: ConfirmPaymentBody) {
    return this.payments.confirm(id, body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('payments/:paymentId/reject') @HttpCode(200)
  reject(@Param('paymentId', ParseUUIDPipe) id: string, @Body(new ZodPipe(rejectPaymentBody)) body: RejectPaymentBody) {
    return this.payments.reject(id, body)
  }

  /** Чек расхода: распознанные поля для формы операции и предупреждение о повторе */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Rate('upload') @Post('receipts/scan') @HttpCode(200)
  scan(@Body(new ZodPipe(scanReceiptBody)) body: ScanReceiptBody) {
    return this.receipts.scan(body)
  }
}
