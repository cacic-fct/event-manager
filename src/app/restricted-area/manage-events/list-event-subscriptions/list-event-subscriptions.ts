// @ts-strict-ignore
import { Component, ViewChild } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { Timestamp } from '@firebase/firestore-types';
import { first, map, Observable } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { User } from 'src/app/shared/services/user';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { DateService } from 'src/app/shared/services/date.service';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonItem,
  IonLabel,
  IonText,
  IonProgressBar,
} from '@ionic/angular/standalone';
import { AsyncPipe, DatePipe } from '@angular/common';

interface Subscription {
  id: string;
  time: Timestamp;
  user: Observable<User | undefined>;
}
@UntilDestroy()
@Component({
  selector: 'app-list-event-subscriptions',
  templateUrl: './list-event-subscriptions.html',
  styleUrls: ['./list-event-subscriptions.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonText,
    IonProgressBar,
    SweetAlert2Module,
    AsyncPipe,
    DatePipe,
  ],
})
export class ListEventSubscriptionsPage {
  @ViewChild('mySwal')
  private mySwal!: SwalComponent;

  event$: Observable<EventItem | undefined>;
  subscriptions$: Observable<Subscription[]>;

  eventID: string;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService,
    public dateService: DateService,
  ) {
    this.eventID = this.route.snapshot.params['eventID'];
    this.afs
      .collection('events')
      .doc(this.eventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document.exists) {
          this.mySwal.fire();
          setTimeout(() => {
            this.router.navigate(['area-restrita/gerenciar-eventos']);
            this.mySwal.close();
          }, 1000);
        }
      });

    this.event$ = this.afs.collection('events').doc<EventItem>(this.eventID).valueChanges();

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
          })),
        ),
      );
  }

  generateCSV() {
    this.afs
      .collection<User>('users')
      .valueChanges({ idField: 'id' })
      .pipe(first(), trace('firestore'))
      .subscribe((users) => {
        const csv: (string | undefined)[][] = [];
        const headers = [
          'UID',
          'Nome da conta Google',
          'Nome completo',
          'Vínculo com a Unesp',
          'RA',
          'Email',
          'Data_locale',
          'Data_iso',
        ];
        csv.push(headers);
        this.subscriptions$.pipe(first()).subscribe((subscriptions) => {
          subscriptions.forEach((item) => {
            const user = users.find((user) => user.uid === item.id);
            if (!user) {
              const row = [item.id, 'Usuário não encontrado'];
              csv.push(row);
              return;
            }

            const row = [
              user.uid,
              user.displayName,
              user.fullName || '',
              user.associateStatus || '',
              user.academicID || 'Sem RA cadastrado',
              user.email,
              this.dateService
                .getDateFromTimestamp(item.time)
                .toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
                .replace(/[",;]/g, ''),
              this.dateService.getDateFromTimestamp(item.time).toISOString(),
            ];
            csv.push(row);
          });

          this.event$.pipe(first()).subscribe((event) => {
            const csvString = csv.map((row) => row.join(',')).join('\n');
            const a = document.createElement('a');
            a.href = window.URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }));
            a.download = `${event.name}_${this.dateService
              .getDateFromTimestamp(event.eventStartDate)
              .toISOString()}.csv`;
            a.click();
          });
        });
      });
  }
}
