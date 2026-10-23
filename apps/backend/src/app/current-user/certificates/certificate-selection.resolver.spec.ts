import { BadRequestException } from '@nestjs/common';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import { CurrentUserCertificateSelectionResolver } from './certificate-selection.resolver';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
const { jest } = import.meta;

function setup() {
  const prisma = { certificate: { findMany: jest.fn().mockResolvedValue([]) } };
  const currentUserContext = {
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
  };
  const rateLimits = { status: jest.fn().mockResolvedValue({ disabled: false, retryAfterSeconds: 30 }) };
  const resolver = new CurrentUserCertificateSelectionResolver(
    prisma as never,
    currentUserContext as never,
    rateLimits as never,
  );
  const context = { req: { user: { sub: 'user-1' } } };
  return { resolver, prisma, currentUserContext, rateLimits, context };
}

describe('CurrentUserCertificateSelectionResolver', () => {
  it('exposes catalog pagination and cooldown in the generated GraphQL schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([CurrentUserCertificateSelectionResolver]);
      const document = printSchema(schema);
      expect(document).toContain('currentUserCertificateCatalog(cursor: String): CurrentUserCertificateCatalog!');
      expect(document).toContain('currentUserCertificateArchiveStatus: CurrentUserCertificateArchiveStatus!');
      expect(document).toContain('type CurrentUserSelectableCertificate');
    } finally {
      await module.close();
    }
  });

  it('paginates the owned catalog and returns only lightweight selection data', async () => {
    const { resolver, prisma, currentUserContext, context } = setup();
    const issuedAt = new Date(Date.now() - 60000);
    const template = { id: 'template-1', name: 'Participação' };
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `certificate-${index}`,
      issuedAt,
      configId: 'config-1',
      certificateTemplate: template,
      config: {
        id: 'config-1',
        name: 'Participação',
        scope: 'EVENT',
        certificateText: null,
        certificateTemplate: template,
        majorEventId: null,
        eventGroupId: null,
        folderId: null,
        eventId: 'event-1',
        eventGroup: null,
        event: { majorEventId: 'major-1', eventGroupId: null, eventGroup: null },
      },
    }));
    prisma.certificate.findMany.mockResolvedValueOnce(records);
    const catalog = await resolver.currentUserCertificateCatalog(context as never, 'previous');
    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith(context);
    expect(catalog.items).toHaveLength(100);
    expect(catalog.nextCursor).toBe('certificate-99');
    expect(catalog.items[0]).toEqual({
      targetType: 'major-event',
      targetId: 'major-1',
      certificate: {
        id: 'certificate-0',
        issuedAt: issuedAt.toISOString(),
        configId: 'config-1',
        certificateTemplate: template,
        config: {
          id: 'config-1',
          name: 'Participação',
          scope: 'EVENT',
          certificateText: null,
          certificateTemplate: template,
        },
      },
    });
    expect(prisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: 'person-1', deletedAt: null, id: { gt: 'previous' } },
        take: 101,
        orderBy: { id: 'asc' },
      }),
    );
  });

  it.each([undefined, null])('accepts an omitted first-page cursor and terminates empty pagination', async (cursor) => {
    const { resolver, context } = setup();
    await expect(resolver.currentUserCertificateCatalog(context as never, cursor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it.each(['', '   ', 'x'.repeat(129)])('rejects invalid cursors before accessing certificates', async (cursor) => {
    const { resolver, prisma, context } = setup();
    await expect(resolver.currentUserCertificateCatalog(context as never, cursor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.certificate.findMany).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'reads account cooldown with authentication without consuming it (disabled: %s)',
    async (disabled) => {
      const { resolver, currentUserContext, rateLimits, context } = setup();
      rateLimits.status.mockResolvedValueOnce({ disabled, retryAfterSeconds: 30 });
      await expect(resolver.currentUserCertificateArchiveStatus(context as never)).resolves.toEqual({
        cooldownSeconds: disabled ? 0 : 30,
      });
      expect(currentUserContext.getAuthenticatedUser).toHaveBeenCalledWith(context);
      expect(rateLimits.status).toHaveBeenCalledWith({
        policy: RATE_LIMIT_POLICIES.currentUserCertificateArchive,
        request: context.req,
      });
    },
  );
});
