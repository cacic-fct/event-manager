import { Injectable } from '@angular/core';
import { fetchAndActivate, RemoteConfig } from '@angular/fire/remote-config';

@Injectable()
export class RemoteConfigService {
  constructor(private remoteConfig: RemoteConfig) {
    fetchAndActivate(this.remoteConfig);
  }
}
