import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { deviceBody, notificationSettingsBody, type DeviceBody, type NotificationSettingsBody } from '@ortaq/shared'
import { z } from 'zod'
import { ZodPipe } from '../../common/zod.pipe'
import { NotificationsService } from './notifications.service'

const listQuery = z.object({ before: z.iso.datetime().optional() })

/** Личная лента, устройства и настройки, docs/03 §18. Только свои записи */
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/notifications')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.notifications.list(q.before)
  }

  @Post('me/notifications/read-all') @HttpCode(200)
  readAll() {
    return this.notifications.markAllRead()
  }

  @Post('notifications/:id/read') @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id)
  }

  @Post('me/devices')
  registerDevice(@Body(new ZodPipe(deviceBody)) body: DeviceBody) {
    return this.notifications.registerDevice(body)
  }

  @Delete('me/devices/:id')
  removeDevice(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.removeDevice(id)
  }

  @Get('me/notification-settings')
  settings() {
    return this.notifications.settings()
  }

  @Patch('me/notification-settings')
  updateSettings(@Body(new ZodPipe(notificationSettingsBody)) body: NotificationSettingsBody) {
    return this.notifications.updateSettings(body)
  }
}
