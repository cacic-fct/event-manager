import { MAT_DATE_LOCALE } from '@angular/material/core';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { ptBR } from 'date-fns/locale/pt-BR';

/** Keep the date adapter with the lazy components that actually render date pickers. */
export function providePortugueseDateFns() {
  return [provideDateFnsAdapter(), { provide: MAT_DATE_LOCALE, useValue: ptBR }];
}
