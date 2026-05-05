import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { CertificateDownload } from '@cacic-eventos/shared-utils';

@Injectable({ providedIn: 'root' })
export class CertificateFileDownloadService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  save(download: CertificateDownload): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const blob = new Blob([this.decodeBase64(download.contentBase64)], {
      type: download.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = download.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private decodeBase64(contentBase64: string): ArrayBuffer {
    const binary = atob(contentBase64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return buffer;
  }
}
