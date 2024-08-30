// Based on ngx-mailto by Anthony Nahas
// https://github.com/AnthonyNahas/ngx-mailto

import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MailtoService {
  document = inject(DOCUMENT);
  compose(value: Mailto): string | void {
    let link = 'mailto:';

    if (!value) {
      return link;
    }

    const properties: string[] = [];
    if (value?.receiver) {
      if (typeof value?.receiver === 'string') {
        link += value?.receiver;
      } else {
        link += value?.receiver.join();
      }
    }
    if (value?.cc) {
      if (typeof value?.cc === 'string') {
        properties.push(`cc=${value?.cc}`);
      } else {
        properties.push(`cc=${value?.cc.join()}`);
      }
    }
    if (value?.bcc) {
      if (typeof value?.bcc === 'string') {
        properties.push(`bcc=${value?.bcc}`);
      } else {
        properties.push(`bcc=${value?.bcc.join()}`);
      }
    }
    if (value?.subject) {
      properties.push(`subject=${encodeURIComponent(value?.subject)}`);
    }
    if (value?.body) {
      properties.push(`body=${encodeURIComponent(value?.body)}`);
    }
    if (properties.length > 0) {
      link += `?${properties.join('&')}`;
    }
    return link;
  }

  open(mailto: Mailto): void {
    this.document.location.href = this.compose(mailto) as string;
  }
}

export interface Mailto {
  receiver?: string | string[];
  subject?: string;
  cc?: string | string[];
  bcc?: string | string[];
  body?: string;
}
