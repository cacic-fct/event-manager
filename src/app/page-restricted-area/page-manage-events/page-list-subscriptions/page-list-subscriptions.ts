import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { fromUnixTime } from 'date-fns';
import { Timestamp } from '@firebase/firestore-types';
import { first, map, Observable } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { User } from 'src/app/shared/services/user';
import { CoursesService } from 'src/app/shared/services/courses.service';

interface Subscription {
  id: string;
  time: Timestamp;
  user: Observable<User>;
}
@UntilDestroy()
@Component({
  selector: 'app-page-list-subscriptions',
  templateUrl: './page-list-subscriptions.html',
  styleUrls: ['./page-list-subscriptions.scss'],
})
export class PageListSubscriptions implements OnInit {
  @ViewChild('mySwal')
  private mySwal: SwalComponent;

  event$: Observable<EventItem>;
  subscriptions$: Observable<Subscription[]>;

  eventID: string;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService
  ) {}

  ngOnInit() {
    this.eventID = this.route.snapshot.params.eventID;
    this.afs
      .collection('events')
      .doc(this.eventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document.exists) {
          this.router.navigate(['area-restrita/gerenciar-evento']);
          this.mySwal.fire();
          setTimeout(() => {
            this.mySwal.close();
          }, 1000);
        }
      });
    this.event$ = this.afs.collection('events').doc<EventItem>(this.eventID).valueChanges().pipe(trace('firestore'));
    this.subscriptions$ = this.afs
      .collection<Subscription>(`events/${this.eventID}/subscriptions`, (ref) => ref.orderBy('time'))
      .valueChanges({ idField: 'id' })
      .pipe(
        untilDestroyed(this),
        trace('firestore'),
        map((subscription) =>
          subscription.map((item) => ({
            ...item,
            user: this.afs
              .collection<User>('users')
              .doc(item.id)
              .get()
              .pipe(map((document) => document.data())),
          }))
        )
      );
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  generateCSV() {
    this.afs
      .collection<User>('users')
      .valueChanges({ idField: 'id' })
      .pipe(first(), trace('firestore'))
      .subscribe((users) => {
        const csv = [];
        const headers = ['UID', 'Nome da conta Google', 'Nome', 'RA', 'Email', 'Data_locale', 'Data_iso'];
        csv.push(headers);
        this.subscriptions$.pipe(first()).subscribe((subscriptions) => {
          subscriptions.forEach((item) => {
            const user = users.find((user) => user.uid === item.id);
            const row = [
              user.uid,
              user.displayName,
              user.fullName,
              user.academicID,
              user.email,
              this.getDateFromTimestamp(item.time).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              this.getDateFromTimestamp(item.time).toISOString(),
            ];
            csv.push(row);
          });

          this.event$.pipe(first()).subscribe((event) => {
            const csvString = csv.map((row) => row.join(',')).join('\n');
            const a = document.createElement('a');
            a.href = window.URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }));
            a.download = `${event.name}_${this.getDateFromTimestamp(event.eventStartDate).toISOString()}.csv`;
            a.click();
          });
        });
      });
  }
}
