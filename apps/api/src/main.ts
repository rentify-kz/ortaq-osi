import './load-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { configure } from './bootstrap'
import { AppModule } from './app.module'
import { env } from './config/env'

async function main() {
  const config = env()
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  configure(app)
  await app.listen(config.PORT)
}

void main()
