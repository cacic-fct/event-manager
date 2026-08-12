import { Controller, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SPORTS_OVERLAY_PERIOD_WORDS } from '@cacic-fct/shared-data-types';
import { Public as PublicRoute } from '../../auth/decorators/public.decorator';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { SportsMatchOverlayService, type SportsMatchOverlayData } from './sports-match-overlay.service';

@ApiTags('sports-overlays')
@Controller('sports')
export class SportsMatchOverlayController {
  constructor(private readonly overlays: SportsMatchOverlayService) {}

  @Get('public/matches/:matchId/overlay')
  @PublicRoute()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'matchId' }])
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
  )
  @ApiOperation({
    summary: 'Render a public sports match overlay for OBS',
    description:
      'Returns a transparent HTML document that follows the public match projection through the same-origin JSON and SSE endpoints.',
  })
  @ApiParam({
    name: 'matchId',
    description: 'Published sports match identifier. Use "demo" to test the overlay without a live match.',
  })
  @ApiOverlayQueries()
  @ApiProduces('text/html')
  @ApiOkResponse({ description: 'Transparent HTML sports overlay.' })
  async render(
    @Param('matchId') matchId: string,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    response.type('html').send(await this.overlays.render(matchId, query));
  }

  @Get('public/matches/:matchId/overlay/data')
  @PublicRoute()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'matchId' }])
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Read the minimal public data used by a sports match overlay',
  })
  @ApiParam({
    name: 'matchId',
    description: 'Published sports match identifier. Use "demo" for static generic overlay data.',
  })
  @ApiProduces('application/json')
  @ApiOkResponse({
    description: 'Minimal score, teams, period, and stopwatch data for the overlay runtime.',
  })
  async data(@Param('matchId') matchId: string): Promise<SportsMatchOverlayData> {
    return this.overlays.data(matchId);
  }

  @Get('public/overlays/sports-match.css')
  @PublicRoute()
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Serve the sports overlay stylesheet.' })
  @ApiProduces('text/css')
  @ApiOkResponse({ description: 'Transparent sports overlay stylesheet.' })
  stylesheet(@Res() response: Response): void {
    response.type('text/css').send(this.overlays.stylesheet());
  }

  @Get('public/overlays/sports-match.js')
  @PublicRoute()
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Serve the sports overlay runtime.' })
  @ApiProduces('application/javascript')
  @ApiOkResponse({ description: 'Same-origin sports overlay runtime.' })
  script(@Res() response: Response): void {
    response.type('application/javascript').send(this.overlays.script());
  }
}

function ApiOverlayQueries(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiQuery({
      name: 'team',
      required: false,
      enum: ['both', 'home', 'away'],
      description: 'Display both teams, only the home team, or only the away team. Default: both.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'teamName',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle team names. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'teamIcon',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle team logos or initials. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'score',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle the score. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'stopwatch',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle the live stopwatch. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'period',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle the active period or round. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'state',
      required: false,
      enum: ['0', '1'],
      description: 'Toggle the match state such as Ao vivo or Pausada. Default: 1.',
    })(target, propertyKey, descriptor);
    ApiQuery({
      name: 'periodWord',
      required: false,
      enum: SPORTS_OVERLAY_PERIOD_WORDS,
      description: 'Allowed label before the active period number. Unknown values use Rodada.',
      example: 'Turno',
    })(target, propertyKey, descriptor);
  };
}
