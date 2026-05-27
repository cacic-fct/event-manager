import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Get()
  @ApiOperation({
    summary: 'Redirect to API documentation',
  })
  @Redirect('https://docs.fctapp.cacic.dev.br/Backend/API', 303)
  getApiRoot(): void {
    return;
  }
}
