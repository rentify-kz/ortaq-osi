import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { uploadUrlBody, type UploadUrlBody } from '@ortaq/shared'
import { HouseScope, Rate } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { FilesService } from './files.service'

/** Файлы дома, docs/03 §14. Пути под домом: членство проверяется до выдачи любой ссылки */
@Controller('houses/:houseId/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @HouseScope() @Rate('upload') @Post('upload-url')
  uploadUrl(@Body(new ZodPipe(uploadUrlBody)) body: UploadUrlBody) {
    return this.files.requestUpload(body)
  }

  @HouseScope() @Post(':fileId/finalize') @HttpCode(200)
  finalize(@Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.finalize(fileId)
  }

  @HouseScope() @Get(':fileId/download-url')
  downloadUrl(@Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.downloadUrl(fileId)
  }
}
