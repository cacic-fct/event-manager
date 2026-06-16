import { ValidationPipe } from '@nestjs/common';

export const REST_VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
