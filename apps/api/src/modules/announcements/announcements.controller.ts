import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { createAnnouncementBody, updateAnnouncementBody, type CreateAnnouncementBody, type UpdateAnnouncementBody } from '@ortaq/shared'
import { HouseScope } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { AnnouncementsService } from './announcements.service'

/** Объявления, docs/03 §11. Пути под домом: членство проверяется до обращения к объявлению */
@Controller('houses/:houseId/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @HouseScope() @Get()
  list() {
    return this.announcements.list()
  }

  @HouseScope('CHAIRMAN') @Post()
  create(@Body(new ZodPipe(createAnnouncementBody)) body: CreateAnnouncementBody) {
    return this.announcements.create(body)
  }

  @HouseScope('CHAIRMAN') @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateAnnouncementBody)) body: UpdateAnnouncementBody) {
    return this.announcements.update(id, body)
  }

  @HouseScope('CHAIRMAN') @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remove(id)
  }

  @HouseScope() @Post(':id/read') @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.markRead(id)
  }

  @HouseScope('CHAIRMAN') @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.stats(id)
  }

  @HouseScope('CHAIRMAN') @Post(':id/remind') @HttpCode(200)
  remind(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remind(id)
  }
}
