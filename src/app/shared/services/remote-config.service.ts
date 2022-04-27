import { Injectable } from '@angular/core';
import { AngularFireRemoteConfig, filterFresh, scanToObject } from '@angular/fire/compat/remote-config';
import { first } from 'rxjs/operators';

@Injectable()
export class RemoteConfigService {
  constructor(remoteConfig: AngularFireRemoteConfig) {
    remoteConfig.changes.pipe(
      filterFresh(172_800_000), // ensure we have values from at least 48 hours ago
      first(),
      // scanToObject when used this way is similar to defaults
      // but most importantly smart-casts remote config values and adds type safety
      scanToObject({
        calendarItemViewDefault: false,
        mapTabEnabled: true,
        manualTabEnabled: false,
        registerPrompt: true,
      })
    );
  }
}
