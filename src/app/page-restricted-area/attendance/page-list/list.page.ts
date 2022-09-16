import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { first, Observable } from 'rxjs';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { EventItem } from 'src/app/shared/services/event';
import { User } from 'src/app/shared/services/user';
import { fromUnixTime } from 'date-fns';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';

import { Timestamp } from '@firebase/firestore-types';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  @ViewChild('mySwal')
  private mySwal: SwalComponent;

  attendanceCollection: attendance[];
  eventID: string;
  event: EventItem;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService
  ) {
    this.eventID = this.route.snapshot.params.eventID;

    this.afs
      .collection('events')
      .doc(this.eventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document.exists) {
          this.router.navigate(['area-restrita/coletar-presenca']);
          this.mySwal.fire();
          setTimeout(() => {
            this.mySwal.close();
          }, 1000);
        }
      });

    this.afs
      .collection('events')
      .doc<EventItem>(this.eventID)
      .valueChanges()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((event) => {
        this.event = event;
      });

    this.afs
      .collection<any>(`events/${this.eventID}/attendance`, (ref) => {
        return ref.orderBy('time', 'desc');
      })
      .valueChanges({ idField: 'id' })
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((items: any[]) => {
        this.attendanceCollection = items.map((item) => {
          return {
            ...item,
            user: this.afs.collection('users').doc<User>(item.id).valueChanges().pipe(trace('firestore')),
          };
        });
      });
  }

  ngOnInit() {}

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  generateCSV() {
    this.afs
      .collection<User>('users')
      .valueChanges({ idfield: 'id' })
      .pipe(first(), trace('firestore'))
      .subscribe((users) => {
        const csv = [];
        const headers = ['Nome', 'RA', 'Email', 'Data_locale', 'Data_iso'];
        csv.push(headers);
        this.attendanceCollection.forEach((attendance) => {
          const user = users.find((user) => user.uid === attendance.id);
          const row = [
            user.displayName,
            user.academicID,
            user.email,
            this.getDateFromTimestamp(attendance.time).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            this.getDateFromTimestamp(attendance.time).toISOString(),
          ];
          csv.push(row);
        });

        const csvString = csv.map((row) => row.join(',')).join('\n');
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }));
        a.download = `${this.event.name}_${this.getDateFromTimestamp(this.event.date).toISOString()}.csv`;
        a.click();
      });
  }
}

interface attendance {
  user: Observable<User>;
  time: Timestamp;
  id?: string;
}
