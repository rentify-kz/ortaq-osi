import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { devSignBody, type DevSignBody } from '@ortaq/shared'
import { Public } from '../../common/decorators'
import { notFound } from '../../common/errors'
import { ZodPipe } from '../../common/zod.pipe'
import { DevSignatureProvider } from './dev-signature.provider'
import { SIGNATURE_PROVIDER, type SignatureProvider } from './signature.provider'

/**
 * Экран «eGov mobile» для разработки: показывает, что подписывается, и подписывает
 * тестовым сертификатом с введёнными ИИН и ФИО. Регистрируется в модуле только вместе
 * с DevSignatureProvider, а тот запрещён в production проверкой конфигурации.
 */
@Controller('dev/egov')
export class DevEgovController {
  constructor(@Inject(SIGNATURE_PROVIDER) private readonly provider: SignatureProvider) {}

  private dev(): DevSignatureProvider {
    if (!(this.provider instanceof DevSignatureProvider)) throw notFound()
    return this.provider
  }

  @Public() @Get(':externalId')
  describe(@Param('externalId', ParseUUIDPipe) externalId: string) {
    const info = this.dev().describe(externalId)
    if (!info) throw notFound('Процедура подписания')
    return info
  }

  @Public() @Post(':externalId/sign') @HttpCode(200)
  sign(@Param('externalId', ParseUUIDPipe) externalId: string, @Body(new ZodPipe(devSignBody)) body: DevSignBody) {
    if (!this.dev().signAs(externalId, { iin: body.iin, fullName: body.full_name })) throw notFound('Процедура подписания')
    return { signed: true }
  }
}
