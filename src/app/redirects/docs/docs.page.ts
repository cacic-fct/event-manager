import { Component, inject } from '@angular/core';

import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-docs',
  template: ``,
  standalone: true,
  imports: [],
})
export class DocsPage {
  document = inject(DOCUMENT);
  constructor() {
    this.document.location.href = 'https://cacic-fct.github.io/fct-app-docs';
  }
}
