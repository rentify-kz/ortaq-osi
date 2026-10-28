import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  addDocumentBody, confirmTransactionBody, createAccountBody, createTransactionBody, removeDocumentBody, transactionListQuery, updateAccountBody,
  updateTransactionBody, voidTransactionBody,
  type AddDocumentBody, type ConfirmTransactionBody, type CreateAccountBody, type CreateTransactionBody, type RemoveDocumentBody, type TransactionListQuery,
  type UpdateAccountBody, type UpdateTransactionBody, type VoidTransactionBody,
} from '@ortaq/shared'
import { HouseScope, Rate, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { AccountsService } from './accounts.service'
import { CategoriesService } from './categories.service'
import { TransactionsService } from './transactions.service'

/** План счетов глобальный: он задан приказом и одинаков для всех домов */
@Controller('budget-categories')
export class BudgetCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list()
  }
}

/** Счета и операции дома, docs/03 §12. Всё, что двигает деньги или их историю, — со step-up */
@Controller('houses/:houseId')
export class FinanceController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
  ) {}

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('accounts')
  listAccounts() {
    return this.accounts.list()
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('accounts')
  createAccount(@Body(new ZodPipe(createAccountBody)) body: CreateAccountBody) {
    return this.accounts.create(body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Patch('accounts/:accountId')
  updateAccount(@Param('accountId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateAccountBody)) body: UpdateAccountBody) {
    return this.accounts.update(id, body)
  }

  /** Журнал открыт всему дому: жильцы видят проведённые и аннулированные, правление — и черновики */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('transactions')
  list(@Query(new ZodPipe(transactionListQuery)) q: TransactionListQuery) {
    return this.transactions.list(q)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('transactions/:transactionId')
  detail(@Param('transactionId', ParseUUIDPipe) id: string) {
    return this.transactions.detail(id)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('transactions')
  create(@Body(new ZodPipe(createTransactionBody)) body: CreateTransactionBody) {
    return this.transactions.create(body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Patch('transactions/:transactionId')
  update(@Param('transactionId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateTransactionBody)) body: UpdateTransactionBody) {
    return this.transactions.update(id, body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('transactions/:transactionId/confirm') @HttpCode(200)
  confirm(@Param('transactionId', ParseUUIDPipe) id: string, @Body(new ZodPipe(confirmTransactionBody)) body: ConfirmTransactionBody) {
    return this.transactions.confirm(id, body)
  }

  /** Председатель — любую; бухгалтер — только свой черновик. Различает сервис */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('transactions/:transactionId/void') @HttpCode(200)
  void(@Param('transactionId', ParseUUIDPipe) id: string, @Body(new ZodPipe(voidTransactionBody)) body: VoidTransactionBody) {
    return this.transactions.void(id, body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Rate('upload') @Post('transactions/:transactionId/documents')
  addDocument(@Param('transactionId', ParseUUIDPipe) id: string, @Body(new ZodPipe(addDocumentBody)) body: AddDocumentBody) {
    return this.transactions.addDocument(id, body)
  }

  /** POST, а не DELETE: у изъятия есть тело — причина. Документ остаётся в базе, меняется только его статус */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('transactions/:transactionId/documents/:documentId/remove') @HttpCode(200)
  removeDocument(
    @Param('transactionId', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodPipe(removeDocumentBody)) body: RemoveDocumentBody,
  ) {
    return this.transactions.removeDocument(id, documentId, body)
  }
}
