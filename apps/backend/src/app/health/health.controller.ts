import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type HealthStatus } from './health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Report whether the HTTP process is alive' })
  @ApiOkResponse({ description: 'The backend process is running.' })
  live(): HealthStatus {
    return this.health.live();
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Report whether critical backend dependencies are ready' })
  @ApiOkResponse({ description: 'PostgreSQL and Redis are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one critical dependency is unavailable.' })
  ready(): Promise<HealthStatus> {
    return this.health.ready();
  }
}
