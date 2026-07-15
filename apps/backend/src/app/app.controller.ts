import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Redirect to API documentation',
  })
  @Redirect('https://docs.eventos.cacic.com.br/Backend/API', 303)
  getApiRoot(): void {
    return;
  }
}
