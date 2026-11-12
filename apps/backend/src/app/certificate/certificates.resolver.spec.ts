import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { EventManagerPermissionScope } from '@prisma/client';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import type { EffectiveRoleScope } from '../authorization/effective-role-scopes';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CertificatesResolver } from './certificates.resolver';
const { jest } = import.meta;

describe('CertificatesResolver authorization', () => {
  it('checks the selected configuration scope, reissuance permission, and frozen protection before scheduling', async () => {
    const { resolver, configsService, authorizationPolicy, frozenResources, issuanceJobs } = createResolver();
    const user = { sub: 'admin' };
    const context = { req: { user } } as never;
    configsService.getConfigById.mockResolvedValue({ id: 'config', scope: CertificateScope.EVENT, eventId: 'event' });
    await resolver.requestCertificateIssuance({ configId: 'config', reissue: true, notifyRecipients: false }, context);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.Certificate.Issue], {
      scope: CertificateScope.EVENT,
      targetId: 'event',
      certificateConfigId: 'config',
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.Certificate.Reissue],
      expect.objectContaining({ targetId: 'event' }),
    );
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config', user, 'edit');
    expect(issuanceJobs.requestIssuance).toHaveBeenCalledWith(
      { configId: 'config', reissue: true, notifyRecipients: false },
      'admin',
    );
  });

  it('never queues a job when scoped authorization fails', async () => {
    const { resolver, configsService, authorizationPolicy, issuanceJobs } = createResolver();
    configsService.getConfigById.mockResolvedValue({
      id: 'config',
      scope: CertificateScope.EVENT,
      eventId: 'outside-scope',
    });
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(resolver.requestCertificateIssuance({ configId: 'config' }, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(issuanceJobs.requestIssuance).not.toHaveBeenCalled();
  });

  it('requires revocation permission for removing manual recipients and records the acting user', async () => {
    const { resolver, configsService, authorizationPolicy, frozenResources, manualRecipients } = createResolver();
    const user = { sub: 'admin' };
    configsService.getConfigById.mockResolvedValue({ id: 'config', scope: CertificateScope.OTHER, folderId: 'folder' });
    await resolver.removeCertificateManualRecipient('config', 'person', { req: { user } } as never);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.Certificate.Delete],
      expect.objectContaining({ targetId: 'folder' }),
    );
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config', user, 'delete');
    expect(manualRecipients.remove).toHaveBeenCalledWith('config', 'person', 'admin');
  });

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

  it('filters issuable event groups and major events to accessible certificate targets', async () => {
    const { authorizationPolicy, resolver, targetsService } = createResolver();
    const user = { sub: 'user-1' };
    const accessibleTargets = {
      eventIds: new Set<string>(),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };
    authorizationPolicy.accessibleEventTargets.mockResolvedValue(accessibleTargets);
    targetsService.listIssuableEventGroups.mockResolvedValue([{ id: 'group-1' }]);
    targetsService.listIssuableMajorEvents.mockResolvedValue([{ id: 'major-1' }]);

    await expect(
      resolver.certificateIssuableEventGroups({ request: { user } } as never, 'grupo', 5, 10),
    ).resolves.toEqual([{ id: 'group-1' }]);
    await expect(
      resolver.certificateIssuableMajorEvents({ request: { user } } as never, 'grande', 10, 15),
    ).resolves.toEqual([{ id: 'major-1' }]);

    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith(user, Permission.CertificateConfig.Read);
    expect(targetsService.listIssuableEventGroups).toHaveBeenCalledWith('grupo', 5, 10, accessibleTargets);
    expect(targetsService.listIssuableMajorEvents).toHaveBeenCalledWith('grande', 10, 15, accessibleTargets);
  });

  it('lists templates, configs, certificates and private downloads with pagination defaults', async () => {
    const { configsService, downloadService, issuingService, resolver } = createResolver();
    configsService.listTemplates.mockResolvedValue([{ id: 'template-1' }]);
    configsService.listConfigsByTarget.mockResolvedValue([{ id: 'config-1' }]);
    issuingService.listCertificatesByTarget.mockResolvedValue([{ id: 'certificate-1' }]);
    downloadService.downloadCertificate.mockResolvedValue({
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'pdf',
    });

    await expect(resolver.certificateTemplates('modelo', false, 2, 3)).resolves.toEqual([{ id: 'template-1' }]);
    await expect(resolver.certificateConfigs(CertificateScope.EVENT, 'event-1')).resolves.toEqual([{ id: 'config-1' }]);
    await expect(
      resolver.certificates(CertificateScope.EVENT, 'event-1', 'config-1', undefined, undefined),
    ).resolves.toEqual([{ id: 'certificate-1' }]);
    await expect(resolver.downloadCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({ fileName: 'certificate.pdf' }),
    );

    expect(configsService.listTemplates).toHaveBeenCalledWith('modelo', false, 2, 3);
    expect(configsService.listConfigsByTarget).toHaveBeenCalledWith(CertificateScope.EVENT, 'event-1', true, 0, 50);
    expect(issuingService.listCertificatesByTarget).toHaveBeenCalledWith(
      CertificateScope.EVENT,
      'event-1',
      'config-1',
      0,
      50,
      undefined,
    );
    expect(downloadService.downloadCertificate).toHaveBeenCalledWith('certificate-1');
  });

  it('passes the name filter and pagination to the counted certificate page', async () => {
    const { issuingService, resolver } = createResolver();
    const page = { items: [{ id: 'certificate-1' }], totalCount: 52 };
    issuingService.listCertificatePageByTarget.mockResolvedValue(page);

    await expect(
      resolver.certificatePage(CertificateScope.EVENT, 'event-1', 'config-1', 50, 51, true, 'Ana'),
    ).resolves.toEqual(page);
    expect(issuingService.listCertificatePageByTarget).toHaveBeenCalledWith(CertificateScope.EVENT, 'event-1', {
      configId: 'config-1',
      skip: 50,
      take: 51,
      includeRevoked: true,
      personName: 'Ana',
    });
  });

  it('loads one certificate configuration through its own authorized target', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-51',
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      eventGroupId: null,
      majorEventId: null,
      folderId: null,
    });

    await expect(resolver.certificateConfig('config-51', { req: { user } } as never)).resolves.toEqual(
      expect.objectContaining({ id: 'config-51' }),
    );

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.CertificateConfig.Read], {
      scope: CertificateScope.EVENT,
      targetId: 'event-1',
    });
  });

  it('checks frozen target state before creating certificate configs', async () => {
    const { configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    const input = {
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    };
    configsService.createConfig.mockResolvedValue({ id: 'config-1', ...input });

    await expect(resolver.createCertificateConfig(input, { req: { user } } as never)).resolves.toEqual(
      expect.objectContaining({ id: 'config-1' }),
    );

    expect(frozenResources.assertCertificateTargetMutable).toHaveBeenCalledWith(
      CertificateScope.EVENT,
      'event-1',
      user,
      'edit',
    );
    expect(configsService.createConfig).toHaveBeenCalledWith(input, user);
  });

  it('supports standalone certificate config creation without a folder target', async () => {
    const { configsService, frozenResources, resolver } = createResolver();
    const input = {
      scope: CertificateScope.OTHER,
      folderId: null,
    };
    configsService.createConfig.mockResolvedValue({ id: 'config-1', ...input });

    await expect(resolver.createCertificateConfig(input, {} as never)).resolves.toEqual(
      expect.objectContaining({ id: 'config-1' }),
    );

    expect(frozenResources.assertCertificateTargetMutable).toHaveBeenCalledWith(
      CertificateScope.OTHER,
      '',
      undefined,
      'edit',
    );
  });

  it('creates certificate folders through the configs service', () => {
    const { configsService, resolver } = createResolver();
    const input = { name: 'Pasta avulsa', emoji: 'folder' };
    configsService.createFolder.mockReturnValue({ id: 'folder-1', ...input });

    expect(resolver.createCertificateFolder(input)).toEqual({ id: 'folder-1', ...input });
    expect(configsService.createFolder).toHaveBeenCalledWith(input, undefined);
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
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.CertificateConfig.Update], {
      scope: CertificateScope.MAJOR_EVENT,
      targetId: 'major-b',
    });
  });

  it('updates certificate configs without replacement target checks when the target is unchanged', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.updateConfig.mockResolvedValue({ id: 'config-1', isActive: false });

    await expect(
      resolver.updateCertificateConfig('config-1', { isActive: false }, { req: { user } } as never),
    ).resolves.toEqual({ id: 'config-1', isActive: false });

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(configsService.getConfigById).not.toHaveBeenCalled();
    expect(frozenResources.assertCertificateTargetMutable).not.toHaveBeenCalled();
    expect(authorizationPolicy.assertPermissions).not.toHaveBeenCalled();
    expect(configsService.updateConfig).toHaveBeenCalledWith('config-1', { isActive: false }, user);
  });

  it('skips replacement target authorization when an update clears the target id', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    });
    configsService.updateConfig.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.EVENT,
      eventId: null,
    });

    await expect(
      resolver.updateCertificateConfig(
        'config-1',
        {
          scope: CertificateScope.EVENT,
          eventId: null,
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'config-1' }));

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(frozenResources.assertCertificateTargetMutable).not.toHaveBeenCalled();
    expect(authorizationPolicy.assertPermissions).not.toHaveBeenCalled();
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
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(3, user, [Permission.Certificate.Read], {
      scope: CertificateScope.EVENT,
      targetId: 'event-1',
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(4, user, [Permission.Certificate.Issue], {
      scope: CertificateScope.EVENT_GROUP,
      targetId: 'group-1',
    });
    expect(issuingService.issueForExistingConfigRecipients).toHaveBeenCalledWith('config-1', 'config-clone', 'user-1');
  });

  it('uses the source target for clone authorization when input is omitted', async () => {
    const { authorizationPolicy, configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.OTHER,
      folderId: 'folder-1',
    });
    configsService.cloneConfig.mockResolvedValue({
      id: 'config-clone',
      scope: CertificateScope.OTHER,
      folderId: 'folder-1',
    });

    await expect(resolver.cloneCertificateConfig('config-1', null, { req: { user } } as never)).resolves.toEqual(
      expect.objectContaining({
        id: 'config-clone',
      }),
    );

    expect(frozenResources.assertCertificateTargetMutable).toHaveBeenCalledWith(
      CertificateScope.OTHER,
      'folder-1',
      user,
      'edit',
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      user,
      [Permission.CertificateConfig.Create],
      {
        scope: CertificateScope.OTHER,
        targetId: 'folder-1',
      },
    );
    expect(configsService.cloneConfig).toHaveBeenCalledWith(
      'config-1',
      null,
      expect.objectContaining({ actor: user, client: expect.anything() }),
    );
  });

  it('copies a manual people list atomically and attributes it to the duplicator', async () => {
    const { authorizationPolicy, configsService, issuingService, prisma, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getConfigById.mockResolvedValue({
      id: 'config-1',
      scope: CertificateScope.OTHER,
      folderId: 'folder-1',
      issuedTo: CertificateIssuedTo.OTHER,
    });
    configsService.cloneConfig.mockResolvedValue({
      id: 'config-copy',
      scope: CertificateScope.OTHER,
      folderId: 'folder-1',
    });
    const copiedCertificate = { id: 'certificate-copy' };
    issuingService.copyManualRecipients.mockResolvedValue([copiedCertificate]);

    await resolver.cloneCertificateConfig('config-1', { parts: { manualPeople: true } }, { req: { user } } as never);

    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(3, user, [Permission.Certificate.Read], {
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(4, user, [Permission.Certificate.Issue], {
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(configsService.cloneConfig).toHaveBeenCalledWith(
      'config-1',
      { parts: { manualPeople: true } },
      expect.objectContaining({ actor: user, client: prisma }),
    );
    expect(issuingService.copyManualRecipients).toHaveBeenCalledWith('config-1', 'config-copy', 'user-1', prisma);
    expect(issuingService.notifyCopiedCertificates).toHaveBeenCalledWith([copiedCertificate]);
  });

  it('deletes certificate configs after frozen delete validation', async () => {
    const { configsService, frozenResources, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.deleteConfig.mockResolvedValue({ id: 'config-1', deleted: true });

    await expect(resolver.deleteCertificateConfig('config-1', { request: { user } } as never)).resolves.toEqual({
      id: 'config-1',
      deleted: true,
    });

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'delete');
    expect(configsService.deleteConfig).toHaveBeenCalledWith('config-1', user);
  });

  it('issues a certificate for one person after frozen config validation', async () => {
    const { frozenResources, issuingService, resolver } = createResolver();
    const user = { sub: ' user-1 ' };
    issuingService.issueForPerson.mockResolvedValue({ id: 'certificate-1' });

    await expect(
      resolver.issueCertificateForPerson('config-1', 'person-1', { req: { user } } as never),
    ).resolves.toEqual({ id: 'certificate-1' });

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(issuingService.issueForPerson).toHaveBeenCalledWith('config-1', 'person-1', 'user-1');
  });

  it('issues missed certificates with an undefined issuer when the subject is blank', async () => {
    const { frozenResources, issuingService, resolver } = createResolver();
    const user = { sub: '   ' };
    issuingService.issueMissedCertificates.mockResolvedValue([{ id: 'certificate-1' }]);

    await expect(resolver.issueMissedCertificates('config-1', { req: { user } } as never)).resolves.toEqual([
      { id: 'certificate-1' },
    ]);

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(issuingService.issueMissedCertificates).toHaveBeenCalledWith('config-1', undefined);
  });

  it('reissues all certificates after checking for frozen certificate targets', async () => {
    const { frozenResources, issuingService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    issuingService.reissueAllCertificates.mockResolvedValue({ reissued: 2, skipped: 0 });

    await expect(resolver.reissueAllCertificates({ req: { user } } as never)).resolves.toEqual({
      reissued: 2,
      skipped: 0,
    });

    expect(frozenResources.assertNoFrozenCertificateTargets).toHaveBeenCalledWith(user, 'edit');
    expect(issuingService.reissueAllCertificates).toHaveBeenCalledWith('user-1');
  });

  it('deletes certificates after frozen certificate validation', async () => {
    const { frozenResources, issuingService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    issuingService.deleteCertificate.mockResolvedValue({ id: 'certificate-1', deleted: true });

    await expect(resolver.deleteCertificate('certificate-1', { req: { user } } as never)).resolves.toEqual({
      id: 'certificate-1',
      deleted: true,
    });

    expect(frozenResources.assertCertificateMutable).toHaveBeenCalledWith('certificate-1', user, 'delete');
    expect(issuingService.deleteCertificate).toHaveBeenCalledWith('certificate-1', 'user-1');
  });

  it('returns all folders with global read permission using constant authorization checks', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    const folders = [{ id: 'folder-1' }, { id: 'folder-2' }];
    configsService.listFolders.mockResolvedValue(folders);
    await expect(resolver.certificateFolders({ req: { user } } as never, 'cert', 0, 20)).resolves.toEqual(folders);
    expect(configsService.listFolders).toHaveBeenCalledWith('cert', 0, 20);
    expect(authorizationPolicy.assertCollectionPermission).toHaveBeenCalledTimes(1);
    expect(authorizationPolicy.assertCollectionPermission).toHaveBeenCalledWith(
      user,
      Permission.CertificateConfig.Read,
    );
  });

  it('does not load a folder page for scoped-only permissions', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    authorizationPolicy.assertCollectionPermission.mockResolvedValue(false);
    await expect(resolver.certificateFolders({ req: { user: { sub: 'user-1' } } } as never)).resolves.toEqual([]);
    expect(configsService.listFolders).not.toHaveBeenCalled();
  });

  it('propagates collection authorization errors', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const error = new Error('policy store unavailable');
    authorizationPolicy.assertCollectionPermission.mockRejectedValue(error);
    await expect(resolver.certificateFolders({ req: { user: { sub: 'user-1' } } } as never)).rejects.toBe(error);
    expect(configsService.listFolders).not.toHaveBeenCalled();
  });

  it('requires folder-scoped read permission before loading one certificate folder', async () => {
    const { authorizationPolicy, configsService, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getFolderById.mockResolvedValue({ id: 'folder-1', name: 'Standalone' });

    await expect(resolver.certificateFolder('folder-1', { req: { user } } as never)).resolves.toEqual({
      id: 'folder-1',
      name: 'Standalone',
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.CertificateConfig.Read], {
      folderId: 'folder-1',
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
  });

  it('bypasses audience restrictions only during public certificate capabilities', async () => {
    const { publicValidationService, downloadService, resolver } = createResolver();
    const scope = jest.fn(async () => {
      await Promise.resolve();
      expect(audienceContext.getStore()?.bypass).toBe(true);
      return { id: 'restricted-certificate' };
    });
    publicValidationService.validateCertificate.mockImplementation(scope);
    downloadService.downloadPublicCertificate.mockImplementation(scope);
    await audienceContext.run(ANONYMOUS_AUDIENCE, async () => {
      await resolver.publicCertificateValidation('restricted-certificate', 'token', { req: {} } as never);
      expect(audienceContext.getStore()).toBe(ANONYMOUS_AUDIENCE);
      await resolver.downloadPublicCertificate('restricted-certificate');
      expect(audienceContext.getStore()).toBe(ANONYMOUS_AUDIENCE);
    });
    expect(scope).toHaveBeenCalledTimes(2);
    expect(audienceContext.getStore()).toBeUndefined();
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

  it('uses context.request when validating a public certificate without context.req', async () => {
    const { publicValidationService, resolver, turnstile } = createResolver();
    const request = { ip: '203.0.113.20' };
    publicValidationService.validateCertificate.mockResolvedValue({ id: 'certificate-1' });

    await expect(resolver.publicCertificateValidation('certificate-1', null, { request } as never)).resolves.toEqual({
      id: 'certificate-1',
    });

    expect(turnstile.assertValidToken).toHaveBeenCalledWith(null, request, TURNSTILE_ACTIONS.certificateValidation);
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
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.CertificateConfig.Delete], {
      folderId: 'folder-1',
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'delete');
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-2', user, 'delete');
    expect(configsService.deleteFolder).toHaveBeenCalledWith('folder-1', user);
  });

  it('checks active standalone configs for frozen edit before updating a folder', async () => {
    const { authorizationPolicy, configsService, frozenResources, issuingService, prisma, resolver } = createResolver();
    const user = { sub: 'user-1' };
    configsService.getFolderById.mockResolvedValue({ id: 'folder-1', name: 'Pasta anterior' });
    configsService.listConfigsByTarget.mockResolvedValue([{ id: 'config-1' }, { id: 'config-2' }]);
    configsService.updateFolder.mockResolvedValue({ id: 'folder-1', name: 'Nova pasta' });

    await expect(
      resolver.updateCertificateFolder('folder-1', { name: 'Nova pasta', reissueCertificates: true }, {
        req: { user },
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'folder-1',
      }),
    );

    expect(configsService.listConfigsByTarget).toHaveBeenCalledWith(CertificateScope.OTHER, 'folder-1');
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.CertificateConfig.Update], {
      folderId: 'folder-1',
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.Certificate.Reissue], {
      folderId: 'folder-1',
      scope: CertificateScope.OTHER,
      targetId: 'folder-1',
    });
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-2', user, 'edit');
    expect(configsService.updateFolder).toHaveBeenCalledWith(
      'folder-1',
      {
        name: 'Nova pasta',
        reissueCertificates: true,
      },
      prisma,
      user,
    );
    expect(issuingService.reissueCertificatesForFolder).toHaveBeenCalledWith('folder-1', 'user-1', prisma, {
      notify: false,
    });
  });

  it('rolls back a folder rename when certificate reissuance fails', async () => {
    const { configsService, issuingService, prisma, resolver } = createResolver();
    configsService.getFolderById.mockResolvedValue({ id: 'folder-1', name: 'Pasta anterior' });
    configsService.listConfigsByTarget.mockResolvedValue([]);
    configsService.updateFolder.mockResolvedValue({ id: 'folder-1', name: 'Nova pasta' });
    issuingService.reissueCertificatesForFolder.mockRejectedValue(new Error('Certificate write failed'));

    await expect(
      resolver.updateCertificateFolder('folder-1', { name: 'Nova pasta', reissueCertificates: true }, {
        req: { user: { sub: 'user-1' } },
      } as never),
    ).rejects.toThrow('Certificate write failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not rename a folder without confirmed certificate reissuance', async () => {
    const { configsService, resolver } = createResolver();
    configsService.getFolderById.mockResolvedValue({ id: 'folder-1', name: 'Pasta anterior' });

    await expect(
      resolver.updateCertificateFolder('folder-1', { name: 'Nova pasta' }, {
        req: { user: { sub: 'user-1' } },
      } as never),
    ).rejects.toThrow('Renaming a certificate folder requires reissuing its certificates.');

    expect(configsService.updateFolder).not.toHaveBeenCalled();
  });
});

describe('certificate folder collection with the real authorization policy', () => {
  function setupPolicy(grants: EffectiveRoleScope[]) {
    const fixture = createResolver();
    const policy = new AuthorizationPolicyService({} as never);
    // Stub only effective-grant storage; retain real collection and scope matching rules.
    const grantStore = jest
      .spyOn(
        policy as unknown as {
          findActiveGrants: () => Promise<EffectiveRoleScope[]>;
        },
        'findActiveGrants',
      )
      .mockResolvedValue(grants);
    fixture.authorizationPolicy.assertCollectionPermission.mockImplementation(
      policy.assertCollectionPermission.bind(policy),
    );
    const user = { sub: 'manager', roleSet: new Set([EventManagerKeycloakRole.Access]) };
    return { ...fixture, grantStore, context: { req: { user } } as never };
  }

  const grant = (scope: EventManagerPermissionScope): EffectiveRoleScope => ({
    permission: Permission.CertificateConfig.Read,
    scope,
    eventId: scope === EventManagerPermissionScope.EVENT ? 'event' : null,
    eventGroupId: scope === EventManagerPermissionScope.EVENT_GROUP ? 'group' : null,
    majorEventId: scope === EventManagerPermissionScope.MAJOR_EVENT ? 'major' : null,
  });

  it.each([
    EventManagerPermissionScope.EVENT,
    EventManagerPermissionScope.EVENT_GROUP,
    EventManagerPermissionScope.MAJOR_EVENT,
  ])('returns no folders for an actual %s grant without querying the folder page', async (scope) => {
    const { resolver, configsService, context, grantStore } = setupPolicy([grant(scope)]);
    await expect(resolver.certificateFolders(context)).resolves.toEqual([]);
    expect(configsService.listFolders).not.toHaveBeenCalled();
    expect(grantStore).toHaveBeenCalledTimes(1);
  });

  it.each([1, 30])('loads all %i folders with a global grant using one grant resolution', async (count) => {
    const { resolver, configsService, context, grantStore } = setupPolicy([grant(EventManagerPermissionScope.GLOBAL)]);
    const folders = Array.from({ length: count }, (_, index) => ({ id: `folder-${index}` }));
    configsService.listFolders.mockResolvedValue(folders);
    await expect(resolver.certificateFolders(context, undefined, 0, count)).resolves.toEqual(folders);
    expect(grantStore).toHaveBeenCalledTimes(1);
    expect(configsService.listFolders).toHaveBeenCalledTimes(1);
  });

  it('returns all folders for super admins without resolving grants', async () => {
    const { resolver, configsService, grantStore } = setupPolicy([]);
    const folders = [{ id: 'folder' }];
    configsService.listFolders.mockResolvedValue(folders);
    const context = { req: { user: { sub: 'admin', roleSet: new Set([EventManagerKeycloakRole.SuperAdmin]) } } };
    await expect(resolver.certificateFolders(context as never)).resolves.toEqual(folders);
    expect(grantStore).not.toHaveBeenCalled();
  });

  it('preserves authorization failure for an access-role user with no grants', async () => {
    const { resolver, configsService, context, grantStore } = setupPolicy([]);
    await expect(resolver.certificateFolders(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantStore).toHaveBeenCalledTimes(1);
    expect(configsService.listFolders).not.toHaveBeenCalled();
  });

  it('propagates effective-grant storage errors before loading folders', async () => {
    const { resolver, configsService, context, grantStore } = setupPolicy([grant(EventManagerPermissionScope.GLOBAL)]);
    const error = new Error('grant database unavailable');
    grantStore.mockRejectedValueOnce(error);
    await expect(resolver.certificateFolders(context)).rejects.toBe(error);
    expect(configsService.listFolders).not.toHaveBeenCalled();
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
    createFolder: jest.fn(),
    cloneConfig: jest.fn(),
    updateConfig: jest.fn(),
    updateFolder: jest.fn(),
    deleteConfig: jest.fn(),
    deleteFolder: jest.fn(),
  };
  const issuingService = {
    listCertificatesByTarget: jest.fn(),
    listCertificatePageByTarget: jest.fn(),
    issueForPerson: jest.fn(),
    issueForExistingConfigRecipients: jest.fn(),
    copyManualRecipients: jest.fn(),
    notifyCopiedCertificates: jest.fn(),
    issueMissedCertificates: jest.fn(),
    reissueAllCertificates: jest.fn(),
    reissueCertificatesForFolder: jest.fn(),
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
    assertCollectionPermission: jest.fn().mockResolvedValue(true),
    assertPermissions: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
  };
  const issuanceJobs = { requestIssuance: jest.fn(), listRuns: jest.fn(), cancel: jest.fn() };
  const manualRecipients = { list: jest.fn(), add: jest.fn(), remove: jest.fn() };
  const resolver = new CertificatesResolver(
    targetsService as never,
    configsService as never,
    issuingService as never,
    downloadService as never,
    publicValidationService as never,
    turnstile as never,
    frozenResources as never,
    authorizationPolicy as never,
    prisma as never,
    issuanceJobs as never,
    manualRecipients as never,
  );

  return {
    issuanceJobs,
    manualRecipients,
    authorizationPolicy,
    configsService,
    frozenResources,
    issuingService,
    prisma,
    downloadService,
    publicValidationService,
    resolver,
    targetsService,
    turnstile,
  };
}
