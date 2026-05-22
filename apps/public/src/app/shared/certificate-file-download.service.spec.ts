import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CertificateFileDownloadService } from './certificate-file-download.service';

describe('CertificateFileDownloadService', () => {
  let click: ReturnType<typeof vi.fn>;
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    click = vi.fn();
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:certificate');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('creates and revokes a browser download URL', () => {
    const anchor = { click, href: '', download: '' };
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: DOCUMENT, useValue: { createElement: vi.fn(() => anchor) } },
      ],
    });

    TestBed.inject(CertificateFileDownloadService).save({
      fileName: 'certificado.pdf',
      mimeType: 'application/pdf',
      contentBase64: btoa('PDF'),
    });

    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe('blob:certificate');
    expect(anchor.download).toBe('certificado.pdf');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:certificate');
  });

  it('does nothing outside the browser', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: DOCUMENT, useValue: { createElement: vi.fn() } },
      ],
    });

    TestBed.inject(CertificateFileDownloadService).save({
      fileName: 'certificado.pdf',
      mimeType: 'application/pdf',
      contentBase64: btoa('PDF'),
    });

    expect(createObjectUrlSpy).not.toHaveBeenCalled();
  });
});
