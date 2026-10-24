import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { applyRegistryBody, ErrorCode, type ApplyRegistryBody } from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { unprocessable } from '../../common/errors'
import { ZodPipe } from '../../common/zod.pipe'
import { RegistryService } from './registry.service'

/** 2000 помещений с ФИО и ИИН — около 200 КБ в CSV. 5 МБ с запасом и без риска для памяти */
const MAX_FILE_BYTES = 5 * 1024 * 1024

@Controller('houses/:houseId/registry')
export class RegistryController {
  constructor(private readonly registry: RegistryService) {}

  @HouseScope('CHAIRMAN') @Get()
  summary() {
    return this.registry.summary()
  }

  /** Только разбор и превью: в реестр ничего не пишется, поэтому без step-up */
  @HouseScope('CHAIRMAN') @Post('imports')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 } }))
  upload(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw unprocessable(ErrorCode.VALIDATION, 'Прикрепите файл реестра')
    return this.registry.upload(file)
  }

  @HouseScope('CHAIRMAN') @Get('imports/:importId')
  preview(@Param('importId', ParseUUIDPipe) importId: string) {
    return this.registry.preview(importId)
  }

  /** Применение меняет эталон верификации и площади — вес голоса. Поэтому step-up */
  @HouseScope('CHAIRMAN') @StepUp() @Post('imports/:importId/apply') @HttpCode(200)
  apply(@Param('importId', ParseUUIDPipe) importId: string, @Body(new ZodPipe(applyRegistryBody)) body: ApplyRegistryBody) {
    return this.registry.apply(importId, body)
  }

  @HouseScope('CHAIRMAN') @Delete('imports/:importId')
  discard(@Param('importId', ParseUUIDPipe) importId: string) {
    return this.registry.discard(importId)
  }
}
