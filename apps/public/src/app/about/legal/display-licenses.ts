import { Component } from '@angular/core';
import { httpResource } from '@angular/common/http';

@Component({
  selector: 'app-display-licenses',
  template: `
    @if (licenses.hasValue()) {
      <pre>{{ licenses.value() }}</pre>
    } @else if (licenses.error()) {
      <p class="error">Não foi possível obter a lista de licenças.</p>
    } @else {
      <p>Carregando licenças...</p>
    }
  `,
  styles: `
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0;
    }

    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DisplayLicenses {
  protected readonly licenses = httpResource.text(() => '/app/3rdpartylicenses.txt');
}
