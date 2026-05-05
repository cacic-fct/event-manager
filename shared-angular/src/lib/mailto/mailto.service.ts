import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export interface Mailto {
  to?: string | string[];
  subject?: string;
  cc?: string | string[];
  bcc?: string | string[];
  body?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MailtoService {
  private readonly document = inject(DOCUMENT);

  private buildQuery(params: Record<string, string | undefined>): string {
    if (Object.values(params).every((value) => !value)) {
      return '';
    }
    return (
      Object.entries(params)
        .filter(([, value]) => value)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
        .join('&')
    );
  }

  compose(value?: Mailto): string {
    if (!value) {
      return 'mailto:';
    }

    const to = this.normalizeList(value.to);

    const query = this.buildQuery({
      cc: this.normalizeList(value.cc) || undefined,
      bcc: this.normalizeList(value.bcc) || undefined,
      subject: value.subject,
      body: value.body,
    });

    return `mailto:${to}${query ? `?${query}` : ''}`;
  }

  open(mailto: Mailto): void {
    this.document.location.href = this.compose(mailto);
  }

  private normalizeList(value?: string | string[]): string {
    if (!value) {
      return '';
    }

    return Array.isArray(value) ? value.join(',') : value;
  }

  private appendList(
    params: URLSearchParams,
    key: 'cc' | 'bcc',
    value?: string | string[],
  ): void {
    if (!value) {
      return;
    }

    params.set(key, this.normalizeList(value));
  }
}
