import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CertificatesResolver } from './certificates.resolver';

describe('CertificatesResolver authorization', () => {
  it('filters issuable target pickers to certificate config grant targets', async () => {
    const { authorizationPolicy, resolver, targetsService } = createResolver();
    const accessibleTargets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
    };
    authorizationPolicy.accessibleEventTargets.mockResolvedValue(accessibleTargets);
    targetsService.listIssuableEvents.mockResolvedValue([{ id: 'event-1' }]);

    await expect(
      resolver.certificateIssuableEvents({ req: { user: { sub: 'user-1' } } } as never, 'cert', 0, 20),
    ).resolves.toEqual([{ id: 'event-1' }]);

    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith(
      { sub: 'user-1' },
      Permission.CertificateConfig.Read,
    );
    expect(targetsService.listIssuableEvents).toHaveBeenCalledWith('cert', 0, 20, accessibleTargets);
  });

  it('requires update permission on replacement certificate config targets', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.MAJOR_EVENT,
      majorEventId: 'major-a',
    });
    configsService.updateConfig.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.MAJOR_EVENT,
      majorEventId: 'major-b',
    });

    await expect(
      resolver.updateCertificateConfig(
        'config-1',
        {
          scope: CertificateScope.MAJOR_EVENT,
          majorEventId: 'major-b',
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        majorEventId: 'major-b',
      }),
    );

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(frozenResources.assertCertificateTargetMutable).toHaveBeenCalledWith(
      CertificateScope.MAJOR_EVENT,
      'major-b',
      user,
      'edit',
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Update],
      {
        scope: CertificateScope.MAJOR_EVENT,
        targetId: 'major-b',
      },
    );
  });

  it('requires read permission on the source config target before cloning', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    });
    configsService.cloneConfig.mockResolvedValue({
      id: 'config-clone',
      scope: CertificateScope.EVENT_GROUP,
      eventGroupId: 'group-1',
    });

    await expect(
      resolver.cloneCertificateConfig(
        'config-1',
        {
          scope: CertificateScope.EVENT_GROUP,
          eventGroupId: 'group-1',
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'config-clone',
      }),
    );

    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      1,
      user,
      [Permission.CertificateConfig.Read],
      {
        scope: CertificateScope.EVENT,
        targetId: 'event-1',
      },
    );
    expect(frozenResources.assertCertificateTargetMutable).toHaveBeenCalledWith(
      CertificateScope.EVENT_GROUP,
      'group-1',
      user,
      'edit',
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      user,
      [Permission.CertificateConfig.Create],
      {
        scope: CertificateScope.EVENT_GROUP,
        targetId: 'group-1',
      },
    );
  });

  it('requires certificate read permission on the source target before cloning issued people', async () => {
    const { authorizationPolicy, configsService, issuingService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    });
    configsService.cloneConfig.mockResolvedValue({
      id: 'config-clone',
      scope: CertificateScope.EVENT_GROUP,
      eventGroupId: 'group-1',
    });

    await resolver.cloneCertificateConfig(
      'config-1',
      {
        scope: CertificateScope.EVENT_GROUP,
        eventGroupId: 'group-1',
        parts: {
          issuedPeople: true,
        },
      },
      { req: { user } } as never,
    );

    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      user,
      [Permission.CertificateConfig.Create],
      {
        scope: CertificateScope.EVENT_GROUP,
        targetId: 'group-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      3,
      user,
      [Permission.Certificate.Read],
      {
        scope: CertificateScope.EVENT,
        targetId: 'event-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      4,
      user,
      [Permission.Certificate.Issue],
      {
        scope: CertificateScope.EVENT_GROUP,
        targetId: 'group-1',
      },
    );
    expect(issuingService.issueForExistingConfigRecipients).toHaveBeenCalledWith(
      'config-1',
      'config-clone',
      'user-1',
    );
  });

  it('filters certificate folders through folder-scoped read authorization', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.listFolders.mockResolvedValue([
      { id: 'folder-1', name: 'Allowed' },
      { id: 'folder-2', name: 'Denied' },
    ]);
    authorizationPolicy.assertPermissions.mockImplementation(async (_user, _permissions, context) => {
      if (context?.targetId === 'folder-2') {
        throw new ForbiddenException('Denied');
      }
    });

    await expect(resolver.certificateFolders({ req: { user } } as never, 'cert', 0, 20)).resolves.toEqual([
      { id: 'folder-1', name: 'Allowed' },
    ]);

    expect(configsService.listFolders).toHaveBeenCalledWith('cert', 0, 20);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Read],
      {
        allowScopedCollection: true,
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Read],
      {
        folderId: 'folder-1',
        scope: CertificateScope.OTHER,
        targetId: 'folder-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Read],
      {
        folderId: 'folder-2',
        scope: CertificateScope.OTHER,
        targetId: 'folder-2',
      },
    );
  });

  it('requires folder-scoped read permission before loading one certificate folder', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getFolderById.mockResolvedValue({ id: 'folder-1', name: 'Standalone' });

    await expect(resolver.certificateFolder('folder-1', { req: { user } } as never)).resolves.toEqual({
      id: 'folder-1',
      name: 'Standalone',
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Read],
      {
        folderId: 'folder-1',
        scope: CertificateScope.OTHER,
        targetId: 'folder-1',
      },
    );
  });

  it('verifies Turnstile before public certificate validation lookup', async () => {
    const { publicValidationService, resolver, turnstile } = createResolver();
    const request = { ip: '203.0.113.10' };
    publicValidationService.validateCertificate.mockResolvedValue({ id: 'certificate-1' });

    await expect(
      resolver.publicCertificateValidation('certificate-1', 'turnstile-token', { req: request } as never),
    ).resolves.toEqual({ id: 'certificate-1' });

    expect(turnstile.assertValidToken).toHaveBeenCalledWith(
      'turnstile-token',
      request,
      TURNSTILE_ACTIONS.certificateValidation,
    );
    expect(publicValidationService.validateCertificate).toHaveBeenCalledWith('certificate-1');
    expect(turnstile.assertValidToken.mock.invocationCallOrder[0]).toBeLessThan(
      publicValidationService.validateCertificate.mock.invocationCallOrder[0],
    );
  });

  it('does not validate a public certificate when Turnstile validation fails', async () => {
    const { publicValidationService, resolver, turnstile } = createResolver();
    const error = new BadRequestException('Turnstile verification failed.');
    turnstile.assertValidToken.mockRejectedValueOnce(error);

    await expect(
      resolver.publicCertificateValidation('certificate-1', 'turnstile-token', {
        req: { ip: '203.0.113.10' },
      } as never),
    ).rejects.toBe(error);

    expect(publicValidationService.validateCertificate).not.toHaveBeenCalled();
  });

  it('uses the public-only certificate download path', async () => {
    const { downloadService, resolver } = createResolver();
    downloadService.downloadPublicCertificate.mockResolvedValue({
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'pdf',
    });

    await expect(resolver.downloadPublicCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({
        fileName: 'certificate.pdf',
      }),
    );

    expect(downloadService.downloadPublicCertificate).toHaveBeenCalledWith('certificate-1');
    expect(downloadService.downloadCertificate).not.toHaveBeenCalled();
  });

  it('checks active standalone configs for frozen delete before deleting a folder', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.listConfigsByTarget.mockResolvedValue([{ id: 'config-1' }, { id: 'config-2' }]);
    configsService.deleteFolder.mockResolvedValue({ id: 'folder-1', deleted: true });

    await expect(resolver.deleteCertificateFolder('folder-1', { req: { user } } as never)).resolves.toEqual({
      id: 'folder-1',
      deleted: true,
    });

    expect(configsService.listConfigsByTarget).toHaveBeenCalledWith(CertificateScope.OTHER, 'folder-1');
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Delete],
      {
        folderId: 'folder-1',
        scope: CertificateScope.OTHER,
        targetId: 'folder-1',
      },
    );
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'delete');
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-2', user, 'delete');
    expect(configsService.deleteFolder).toHaveBeenCalledWith('folder-1');
  });

  it('checks active standalone configs for frozen edit before updating a folder', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.listConfigsByTarget.mockResolvedValue([{ id: 'config-1' }, { id: 'config-2' }]);
    configsService.updateFolder.mockResolvedValue({ id: 'folder-1', name: 'Nova pasta' });

    await expect(
      resolver.updateCertificateFolder('folder-1', { name: 'Nova pasta' }, { req: { user } } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'folder-1',
      }),
    );

    expect(configsService.listConfigsByTarget).toHaveBeenCalledWith(CertificateScope.OTHER, 'folder-1');
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.CertificateConfig.Update],
      {
        folderId: 'folder-1',
        scope: CertificateScope.OTHER,
        targetId: 'folder-1',
      },
    );
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-2', user, 'edit');
    expect(configsService.updateFolder).toHaveBeenCalledWith('folder-1', { name: 'Nova pasta' });
  });
});

function createResolver() {
  const targetsService = {
    listIssuableEvents: jest.fn(),
    listIssuableEventGroups: jest.fn(),
    listIssuableMajorEvents: jest.fn(),
  };
  const configsService = {
    listTemplates: jest.fn(),
    listFolders: jest.fn(),
    getFolderById: jest.fn(),
    listConfigsByTarget: jest.fn(),
    getConfigById: jest.fn(),
    createConfig: jest.fn(),
    cloneConfig: jest.fn(),
    updateConfig: jest.fn(),
    updateFolder: jest.fn(),
    deleteConfig: jest.fn(),
    deleteFolder: jest.fn(),
  };
  const issuingService = {
    listCertificatesByTarget: jest.fn(),
    issueForPerson: jest.fn(),
    issueForExistingConfigRecipients: jest.fn(),
    issueMissedCertificates: jest.fn(),
    reissueAllCertificates: jest.fn(),
    deleteCertificate: jest.fn(),
  };
  const downloadService = {
    downloadCertificate: jest.fn(),
    downloadPublicCertificate: jest.fn(),
  };
  const publicValidationService = {
    validateCertificate: jest.fn(),
  };
  const turnstile = {
    assertValidToken: jest.fn().mockResolvedValue(undefined),
  };
  const frozenResources = {
    assertCertificateTargetMutable: jest.fn(),
    assertCertificateConfigMutable: jest.fn(),
    assertNoFrozenCertificateTargets: jest.fn(),
    assertCertificateMutable: jest.fn(),
  };
  const authorizationPolicy = {
    accessibleEventTargets: jest.fn(),
    assertPermissions: jest.fn(),
  };
  const resolver = new CertificatesResolver(
    targetsService as never,
    configsService as never,
    issuingService as never,
    downloadService as never,
    publicValidationService as never,
    turnstile as never,
    frozenResources as never,
    authorizationPolicy as never,
  );

  return {
    authorizationPolicy,
    configsService,
    frozenResources,
    issuingService,
    downloadService,
    publicValidationService,
    resolver,
    targetsService,
    turnstile,
  };
}
