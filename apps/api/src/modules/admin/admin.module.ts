import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ChairmanService } from './chairman.service.js';

@Module({ controllers: [AdminController], providers: [AdminService, ChairmanService] })
export class AdminModule {}
