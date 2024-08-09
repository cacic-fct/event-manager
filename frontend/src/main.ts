import { isDevMode } from '@angular/core';
import { AppComponent } from './app/app.component';
import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
registerLocaleData(localePt);

import { setNonce } from '@ionic/core/components';

import { appConfig } from 'src/app/app.config';

console.debug('DEBUG: main.ts: Nonce: Will fetch nonce');

export const nonce = fetchNonce();
setNonce(nonce);

bootstrapApplication(AppComponent, appConfig).catch((err) => console.log(err));

export function fetchNonce(): string {
  const regex = new RegExp(`s*nonce=`);
  const nonce = document.cookie.split(';').find((cookie) => cookie.match(regex));
  console.debug('DEBUG: main.ts: Nonce:', nonce?.split('=')[1].slice(0, 7));
  if (!nonce) {
    if (isDevMode()) {
      console.debug('DEBUG: main.ts: Nonce: Using development-nonce');
      return 'development-nonce';
    }

    const message =
      'Ocorreu um erro ao validar a integridade do aplicativo.\nRecarregue a página.\nErro: Nonce não encontrado';

    window.alert(message);

    window.location.reload();

    throw new Error('Nonce not found in cookies');
  }
  return nonce.split('=')[1];
}
