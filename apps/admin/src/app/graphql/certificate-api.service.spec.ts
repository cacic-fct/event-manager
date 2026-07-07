import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import {
  createAdminCertificateConfig,
  createAdminCertificateTemplate,
  createAdminEvent,
  createAdminEventGroup,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { CertificateApiService } from './certificate-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('CertificateApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: CertificateApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListCertificateIssuableEvents')) {
          return of({ certificateIssuableEvents: [createAdminEvent({ id: 'event-1' })] });
        }
        if (query.includes('ListCertificateIssuableEventGroups')) {
          return of({ certificateIssuableEventGroups: [createAdminEventGroup({ id: 'group-1' })] });
        }
        if (query.includes('ListCertificateIssuableMajorEvents')) {
          return of({ certificateIssuableMajorEvents: [createAdminMajorEvent({ id: 'major-1' })] });
        }
        if (query.includes('ListCertificateFolders')) {
          return of({ certificateFolders: [certificateFolder()] });
        }
        if (query.includes('ListCertificateTemplates')) {
          return of({ certificateTemplates: [createAdminCertificateTemplate()] });
        }
        if (query.includes('ListCertificateConfigs')) {
          return of({ certificateConfigs: [createAdminCertificateConfig({ id: 'config-1' })] });
        }
        if (query.includes('ListCertificates')) {
          return of({ certificates: [certificate()] });
        }
        if (query.includes('CreateCertificateConfig')) {
          return of({ createCertificateConfig: createAdminCertificateConfig({ id: 'created-config' }) });
        }
        if (query.includes('CreateCertificateFolder')) {
          return of({ createCertificateFolder: certificateFolder({ id: 'created-folder' }) });
        }
        if (query.includes('UpdateCertificateFolder')) {
          return of({ updateCertificateFolder: certificateFolder({ id: 'updated-folder' }) });
        }
        if (query.includes('DeleteCertificateFolder')) {
          return of({ deleteCertificateFolder: { id: 'folder-1', deleted: true } });
        }
        if (query.includes('CertificateFolder')) {
          return of({ certificateFolder: certificateFolder({ id: 'folder-2' }) });
        }
        if (query.includes('UpdateCertificateConfig')) {
          return of({ updateCertificateConfig: createAdminCertificateConfig({ id: 'updated-config' }) });
        }
        if (query.includes('CloneCertificateConfig')) {
          return of({ cloneCertificateConfig: createAdminCertificateConfig({ id: 'cloned-config' }) });
        }
        if (query.includes('DeleteCertificateConfig')) {
          return of({ deleteCertificateConfig: { id: 'config-1', deleted: true } });
        }
        if (query.includes('IssueCertificateForPerson')) {
          return of({ issueCertificateForPerson: certificate({ id: 'certificate-person' }) });
        }
        if (query.includes('IssueMissedCertificates')) {
          return of({ issueMissedCertificates: [certificate({ id: 'certificate-missed' })] });
        }
        if (query.includes('ReissueAllCertificates')) {
          return of({ reissueAllCertificates: { configCount: 2, certificateCount: 5 } });
        }
        if (query.includes('DeleteCertificate')) {
          return of({ deleteCertificate: { id: 'certificate-1', deleted: true } });
        }
        return of({
          downloadCertificate: {
            fileName: 'certificate.pdf',
            mimeType: 'application/pdf',
            contentBase64: 'pdf',
          },
        });
      }),
    };

    TestBed.configureTestingModule({
      providers: [CertificateApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(CertificateApiService);
  });

  it('maps target, folder, template, config, and certificate queries from response fields', async () => {
    await expect(firstValueFrom(service.listCertificateIssuableEvents({ query: 'aula', skip: 1, take: 2 }))).resolves.toEqual([
      createAdminEvent({ id: 'event-1' }),
    ]);
    await expect(firstValueFrom(service.listCertificateIssuableEventGroups())).resolves.toEqual([
      createAdminEventGroup({ id: 'group-1' }),
    ]);
    await expect(firstValueFrom(service.listCertificateIssuableMajorEvents())).resolves.toEqual([
      createAdminMajorEvent({ id: 'major-1' }),
    ]);
    await expect(firstValueFrom(service.listCertificateFolders({ query: 'extra' }))).resolves.toEqual([
      certificateFolder(),
    ]);
    await expect(firstValueFrom(service.getCertificateFolder('folder-2'))).resolves.toEqual(
      certificateFolder({ id: 'folder-2' }),
    );
    await expect(firstValueFrom(service.listCertificateTemplates({ includeInactive: true }))).resolves.toEqual([
      createAdminCertificateTemplate(),
    ]);
    await expect(firstValueFrom(service.listCertificateConfigs('OTHER', 'folder-1', { includeInactive: false }))).resolves.toEqual([
      createAdminCertificateConfig({ id: 'config-1' }),
    ]);
    await expect(firstValueFrom(service.listCertificates('OTHER', 'folder-1', { configId: 'config-1' }))).resolves.toEqual([
      certificate(),
    ]);

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('ListCertificateIssuableEvents'), {
      query: 'aula',
      skip: 1,
      take: 2,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('CertificateFolder'), {
      id: 'folder-2',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(7, expect.stringContaining('ListCertificateConfigs'), {
      scope: 'OTHER',
      targetId: 'folder-1',
      includeInactive: false,
      skip: undefined,
      take: undefined,
    });
  });

  it('maps folder, config, issue, reissue, download, and delete mutations', async () => {
    const folderInput = { name: 'Atividades complementares', emoji: '🏅' };
    const configInput = { name: 'Certificado', scope: 'OTHER' as const, folderId: 'folder-1' };

    await expect(firstValueFrom(service.createCertificateConfig(configInput))).resolves.toEqual(
      createAdminCertificateConfig({ id: 'created-config' }),
    );
    await expect(firstValueFrom(service.createCertificateFolder(folderInput))).resolves.toEqual(
      certificateFolder({ id: 'created-folder' }),
    );
    await expect(firstValueFrom(service.updateCertificateFolder('folder-1', folderInput))).resolves.toEqual(
      certificateFolder({ id: 'updated-folder' }),
    );
    await expect(firstValueFrom(service.deleteCertificateFolder('folder-1'))).resolves.toEqual({
      id: 'folder-1',
      deleted: true,
    });
    await expect(firstValueFrom(service.updateCertificateConfig('config-1', configInput))).resolves.toEqual(
      createAdminCertificateConfig({ id: 'updated-config' }),
    );
    await expect(
      firstValueFrom(
        service.cloneCertificateConfig('config-1', {
          scope: 'OTHER',
          folderId: 'folder-1',
          parts: { textContent: true },
        }),
      ),
    ).resolves.toEqual(createAdminCertificateConfig({ id: 'cloned-config' }));
    await expect(firstValueFrom(service.deleteCertificateConfig('config-1'))).resolves.toEqual({
      id: 'config-1',
      deleted: true,
    });
    await expect(firstValueFrom(service.issueCertificateForPerson('config-1', 'person-1'))).resolves.toEqual(
      certificate({ id: 'certificate-person' }),
    );
    await expect(firstValueFrom(service.issueMissedCertificates('config-1'))).resolves.toEqual([
      certificate({ id: 'certificate-missed' }),
    ]);
    await expect(firstValueFrom(service.reissueAllCertificates())).resolves.toEqual({
      configCount: 2,
      certificateCount: 5,
    });
    await expect(firstValueFrom(service.deleteCertificate('certificate-1'))).resolves.toEqual({
      id: 'certificate-1',
      deleted: true,
    });
    await expect(firstValueFrom(service.downloadCertificate('certificate-1'))).resolves.toEqual({
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'pdf',
    });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(6, expect.stringContaining('CloneCertificateConfig'), {
      id: 'config-1',
      input: {
        scope: 'OTHER',
        folderId: 'folder-1',
        parts: { textContent: true },
      },
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(12, expect.stringContaining('DownloadCertificate'), {
      certificateId: 'certificate-1',
    });
  });
});

function certificateFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    name: 'Atividades complementares',
    emoji: '🏅',
    createdAt: '2026-07-01T12:00:00.000Z',
    createdById: null,
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: null,
    deletedAt: null,
    ...overrides,
  };
}

function certificate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'certificate-1',
    configId: 'config-1',
    personId: 'person-1',
    person: {
      id: 'person-1',
      name: 'Maria Teste',
      email: 'maria@example.edu',
      identityDocument: '12345678900',
    },
    issuedAt: '2026-07-01T12:00:00.000Z',
    issuedById: 'admin-1',
    config: createAdminCertificateConfig(),
    deletedAt: null,
    ...overrides,
  };
}
