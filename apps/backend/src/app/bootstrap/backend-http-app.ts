import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { createDocsAuthGate } from '../auth/docs-auth.middleware';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AppModule } from '../app.module';
import { requestContextMiddleware } from './request-context';

const globalPrefix = 'api';

export async function createBackendHttpApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  configureBackendHttpApp(app);
  return app;
}

export function configureBackendHttpApp(app: INestApplication): void {
  const production = process.env.NODE_ENV === 'production';

  const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS ?? 'loopback,linklocal,uniquelocal')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyIps);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.use(
    '/api/a/glitchtip',
    express.raw({
      type: ['application/x-sentry-envelope', 'text/plain'],
      limit: '1mb',
      verify: (request, _response, buffer) => {
        (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    if (production) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.setGlobalPrefix(globalPrefix);
  app.use(
    createDocsAuthGate({
      keycloakAuthService: app.get(KeycloakAuthService),
      production,
    }),
  );
  app.enableCors({
    origin: ['https://eventos.cacic.com.br', 'https://secompp.cacic.com.br'],
    credentials: true,
  });

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
}

export function getBackendGlobalPrefix(): string {
  return globalPrefix;
}
