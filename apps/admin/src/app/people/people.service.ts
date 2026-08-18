import { Injectable } from '@angular/core';
import { PeopleRecords } from './people-records';

@Injectable({
  providedIn: 'root',
})
export class PeopleService extends PeopleRecords {}
