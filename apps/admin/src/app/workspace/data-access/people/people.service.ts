import { Injectable } from '@angular/core';
import { WorkspacePeoplePermissionGrantPersistence } from './people-permission-grant-persistence';

@Injectable({
  providedIn: 'root',
})
export class WorkspacePeopleService extends WorkspacePeoplePermissionGrantPersistence {}
