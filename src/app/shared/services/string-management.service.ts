import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class StringManagementService {
  toUppercase(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}
