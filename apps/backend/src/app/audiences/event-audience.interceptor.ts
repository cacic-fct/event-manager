import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { authenticateHttpRequest, type AuthenticatedRequest } from '../auth/authenticated-request';
import { readAuthCookie } from '../auth/auth-cookie-utils';
import { AUTH_SESSION_COOKIE_NAME, IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { ANONYMOUS_AUDIENCE, audienceContext, type EventAudiencePrincipal } from './audience-context';
import { EventAudienceService } from './event-audience.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PAST_PARTICIPATION_ACCESS } from './past-participation.decorator';

type AudienceRequest = AuthenticatedRequest & { audiencePrincipal?: Promise<EventAudiencePrincipal> };

@Injectable()
export class EventAudienceInterceptor implements NestInterceptor {
  constructor(
    private readonly audiences: EventAudienceService,
    private readonly auth: KeycloakAuthService,
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationPolicyService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    // Authentication endpoints must be able to refresh or clear an expired session.
    // The authenticated M2M profile callback performs internal synchronization.
    if (['AuthController', 'AuthResolver', 'HealthController', 'AccountProfileUpdateController'].includes(context.getClass().name)) {
      return next.handle();
    }
    const kind = context.getType<'http' | 'graphql'>();
    const gql = kind === 'graphql' ? GqlExecutionContext.create(context).getContext<{ req?: AudienceRequest; request?: AudienceRequest }>() : undefined;
    const request = kind === 'http' ? context.switchToHttp().getRequest<AudienceRequest>() : gql?.req ?? gql?.request;
    if (!request) return next.handle();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    // Shared offline caches explicitly request anonymous content. A session cookie
    // may exist before the frontend has finished restoring its authentication state.
    const anonymousOnly = kind === 'graphql' && isPublic && request.headers['x-event-audience'] === 'public';
    const basePrincipal = anonymousOnly
      ? ANONYMOUS_AUDIENCE
      : await (request.audiencePrincipal ??= this.resolvePrincipal(request, isPublic));
    const readOperation = kind === 'graphql'
      ? GqlExecutionContext.create(context).getInfo<{ operation?: { operation?: string } }>()?.operation?.operation === 'query'
      : request.method === 'GET';
    const includeHistory = readOperation && this.reflector.getAllAndOverride<boolean>(PAST_PARTICIPATION_ACCESS, [context.getHandler()]) === true;
    const principal = includeHistory && !anonymousOnly && basePrincipal.personIds.length > 0
      ? { ...basePrincipal, pastParticipationBefore: new Date() }
      : basePrincipal;
    const permissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const args = kind === 'graphql' ? GqlExecutionContext.create(context).getArgs() : { params: request.params, query: request.query, body: request.body };
    await this.authorization.assertAudienceForPermissions(permissions, this.authorization.buildResourceContext(args, permissions), principal);
    // Subscribe inside run: returning an Observable alone does not propagate AsyncLocalStorage.
    return new Observable((subscriber) => audienceContext.run(principal, () => next.handle().subscribe(subscriber)));
  }

  private async resolvePrincipal(request: AudienceRequest, isPublic: boolean): Promise<EventAudiencePrincipal> {
    if (!request.user && (request.headers.authorization || readAuthCookie(request, AUTH_SESSION_COOKIE_NAME))) {
      try {
        await authenticateHttpRequest(request, this.auth);
      } catch (error) {
        if (!isPublic || !(error instanceof UnauthorizedException)) throw error;
        return ANONYMOUS_AUDIENCE;
      }
    }
    return this.audiences.principalForUser(request.user);
  }
}
