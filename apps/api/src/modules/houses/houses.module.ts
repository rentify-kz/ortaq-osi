import { Module } from '@nestjs/common';
import { HousesController } from './houses.controller.js';

@Module({ controllers: [HousesController] })
export class HousesModule {}
