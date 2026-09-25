import { Controller, Get } from '@nestjs/common';
import { NoRequestTx, Public } from '../../common/auth/decorators.js';
import { DbService } from '../../infra/db/db.service.js';

@Controller('health')
@Public()
@NoRequestTx()
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async health(): Promise<{ status: 'ok' }> {
    await this.db.rw.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
