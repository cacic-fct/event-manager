import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
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
    listConfigsByTarget: jest.fn(),
    getConfigById: jest.fn(),
    createConfig: jest.fn(),
    updateConfig: jest.fn(),
    deleteConfig: jest.fn(),
  };
  const issuingService = {
    listCertificatesByTarget: jest.fn(),
    issueForPerson: jest.fn(),
    issueMissedCertificates: jest.fn(),
    reissueAllCertificates: jest.fn(),
    deleteCertificate: jest.fn(),
  };
  const downloadService = {
    downloadCertificate: jest.fn(),
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
    publicValidationService,
    resolver,
    targetsService,
    turnstile,
  };
}
