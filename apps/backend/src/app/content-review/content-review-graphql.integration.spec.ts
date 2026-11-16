import { readFileSync } from 'node:fs';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { graphql } from 'graphql';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContentReviewInvalidationService } from './content-review-invalidation.service';
import { ContentReviewResolver } from './content-review.resolver';

const { jest } = import.meta;

const clientSource = readFileSync(
  new URL('../../../../admin/src/app/content-reviews/content-reviews-api.service.ts', import.meta.url),
  'utf8',
);

function clientOperation(name: string): string {
  const operation = clientSource.matchAll(/`((?:query|mutation) \w+\b[^`]+)`/g);
  const source = Array.from(operation, ([, document]) => document).find((document) =>
    document.split('(')[0].endsWith(` ${name}`),
  );
  if (!source) throw new Error(`Missing admin GraphQL operation: ${name}`);
  return source;
}

describe('content review GraphQL integration', () => {
  const user = { sub: 'reviewer' };
  const entry = {
    id: 'review-1',
    personId: 'person-1',
    eventId: null,
    profile: { person: { name: 'Ana Mota' } },
    event: null,
    revision: 3,
    updatedAt: new Date(),
    changes: [
      {
        kind: 'profileField',
        key: 'photo',
        authorName: 'Ana',
        before: { publishGoogleUserPicture: true, googleUserPicture: null },
        after: { publishGoogleUserPicture: false, googleUserPicture: 'https://example.org/private-photo' },
      },
    ],
  };
  const prisma = {
    contentReview: { findMany: jest.fn().mockResolvedValue([entry]), findUnique: jest.fn().mockResolvedValue(entry) },
    $transaction: jest.fn(),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true })],
      providers: [
        ContentReviewResolver,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CurrentUserContextService,
          useValue: { getAuthenticatedUser: CurrentUserContextService.prototype.getAuthenticatedUser },
        },
        {
          provide: AuthorizationPolicyService,
          useValue: {
            assertPermissions: async (_actor: typeof user, permissions: Permission[]) => {
              if (permissions[0] !== Permission.LecturerProfile.Review) throw new ForbiddenException();
            },
            accessibleEventTargets: async () => ({
              eventIds: new Set(),
              eventGroupIds: new Set(),
              majorEventIds: new Set(),
            }),
          },
        },
        { provide: FrozenResourceService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: ContentReviewInvalidationService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  function execute(name: string, variableValues: Record<string, unknown>) {
    return graphql({
      schema: app.get(GraphQLSchemaHost).schema,
      source: clientOperation(name),
      variableValues,
      contextValue: { req: { user } },
    });
  }

  it('serves a deep-linked profile comparison in the admin query without exposing the hidden photo URL', async () => {
    const result = await execute('ContentReviews', { page: 0, id: entry.id });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      contentReviews: {
        hasNextPage: false,
        groups: [
          {
            id: entry.id,
            revision: entry.revision,
            targetName: 'Ana Mota',
            updatedAt: entry.updatedAt.toISOString(),
            isProfile: true,
            items: [
              {
                key: 'photo',
                authorName: 'Ana',
                fields: [{ key: 'photo', before: 'Visível quando disponível', after: 'Oculta' }],
                beforeMaterial: null,
                afterMaterial: null,
              },
            ],
          },
        ],
      },
    });
    expect(prisma.contentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: entry.id, OR: [{ profile: { is: { person: { deletedAt: null } } } }] },
      }),
    );
  });

  it('rejects duplicate keys sent by the admin mutation before reading or writing review state', async () => {
    const result = await execute('DecideContentReview', {
      id: entry.id,
      revision: entry.revision,
      keys: ['photo', 'photo'],
      decision: 'REJECT',
    });

    expect(result.errors?.map(({ message }) => message)).toEqual(['Selecione as alterações que deseja revisar.']);
    expect(prisma.contentReview.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
