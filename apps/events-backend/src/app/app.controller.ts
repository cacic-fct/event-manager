import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  // TODO: Redirect to API docs
  @Redirect('https://docs.fctapp.cacic.dev.br', 303)
  getApiRoot(): void {
    return;
  }
}
