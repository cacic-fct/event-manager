import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Redirect('https://docs.fctapp.cacic.dev.br/Backend/API', 303)
  getApiRoot(): void {
    return;
  }
}
