import { Injectable } from '@angular/core';

export interface Committee {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  members: {
    name: string;
    role: string;
    joinedDate: Date | null;
    leftDate: Date | null;
  }[];
}
@Injectable({
  providedIn: 'root',
})
export class CommitteesService {
}
