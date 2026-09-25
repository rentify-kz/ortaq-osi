import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TotpService } from './totp.service.js';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, PasswordService, SessionService, TotpService],
  exports: [PasswordService, SessionService, TotpService],
})
export class AuthModule {}
