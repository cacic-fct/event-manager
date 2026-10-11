import { Injector, inject } from '@angular/core';

/** Configure icons before bootstrap without eagerly loading Material component code. */
export async function initializeMaterialSymbols(): Promise<void> {
  const injector = inject(Injector);
  const { MatIconRegistry } = await import('@angular/material/icon');
  injector.get(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
}
