/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AUTH_SESSION_COOKIE_NAME } from './app/auth/auth.constants';
import { createDocsAuthGate } from './app/auth/docs-auth.middleware';
import { KeycloakAuthService } from './app/auth/keycloak-auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const globalPrefix = 'api';
  const production = process.env.NODE_ENV === 'production';

  app.use(cookieParser());
  app.setGlobalPrefix(globalPrefix);
  app.use(
    createDocsAuthGate({
      keycloakAuthService: app.get(KeycloakAuthService),
      production,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('CACiC Eventos')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(AUTH_SESSION_COOKIE_NAME, {
      type: 'apiKey',
      in: 'cookie',
      description: 'Sessao autenticada criada pelo login do backend.',
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory, {
    customSiteTitle: 'CACiC Eventos API',
    swaggerOptions: {
      persistAuthorization: true,
      requestInterceptor: (request: { credentials?: 'include' | 'omit' | 'same-origin' }) => {
        request.credentials = 'include';
        return request;
      },
    },
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
