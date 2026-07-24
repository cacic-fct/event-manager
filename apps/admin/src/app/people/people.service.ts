import { Injectable } from '@angular/core';
import { PeoplePermissionGrantPersistence } from './people-permission-grant-persistence';

@Injectable({
  providedIn: 'root',
})
export class PeopleService extends PeoplePermissionGrantPersistence {}
