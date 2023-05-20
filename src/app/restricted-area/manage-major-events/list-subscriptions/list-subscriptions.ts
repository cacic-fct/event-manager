import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { fromUnixTime } from 'date-fns';
import { Timestamp } from '@firebase/firestore-types';
import { map, Observable, take, forkJoin } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { User } from 'src/app/shared/services/user';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventSubscription, MajorEventItem } from '../../../shared/services/major-event.service';
import { DateService } from 'src/app/shared/services/date.service';

interface Subscription extends MajorEventSubscription {
  id: string;
  time: Timestamp;
  user: Observable<User | undefined>;
}
@UntilDestroy()
@Component({
  selector: 'app-list-subscriptions',
  templateUrl: './list-subscriptions.html',
  styleUrls: ['./list-subscriptions.scss'],
})
export class ListSubscriptionsPage implements OnInit {
  @ViewChild('mySwal')
  private mySwal!: SwalComponent;

  event$: Observable<EventItem>;
  subscriptions$: Observable<Subscription[]>;

  eventID: string;

  disableCSVDownloadButton: boolean = false;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService,
    public dateService: DateService
  ) {
    this.eventID = this.route.snapshot.params.eventID;
    this.afs
      .collection('majorEvents')
      .doc(this.eventID)
      .valueChanges()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document) {
          this.mySwal.fire();
          setTimeout(() => {
            this.router.navigate(['area-restrita/gerenciar-grandes-eventos']);
            this.mySwal.close();
          }, 1000);
        }
      });

    this.event$ = this.afs
      .collection('majorEvents')
      .doc<EventItem>(this.eventID)
      .valueChanges()
      // @ts-ignore
      .pipe(trace('firestore'));

    this.subscriptions$ = this.afs
      .collection<MajorEventSubscription>(`majorEvents/${this.eventID}/subscriptions`, (ref) => ref.orderBy('time'))
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
              .pipe(map((doc) => doc.data())),
          }))
        )
      );
  }

  ngOnInit() {}

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  generateCSV() {
    this.disableCSVDownloadButton = true;
    this.afs
      .collection<User>('users')
      .valueChanges({ idField: 'id' })
      .pipe(take(1), trace('firestore'))
      .subscribe((users) => {
        const csv: (string | number | undefined)[][] = [];
        const headers = [
          'UID',
          'Nome da conta Google',
          'Nome completo',
          'Vínculo com a Unesp',
          'RA',
          'Email',
          'Código do status do pagamento',
          'Status do pagamento',
          'Data da última alteração no pagamento locale',
          'Data da última alteração no pagamento ISO',
          'Data da inscrição locale',
          'Data da inscrição ISO',
          'Inscreveu-se nos eventos com ID',
          'Inscreveu-se nos eventos com nome',
        ];
        csv.push(headers);
        this.subscriptions$.pipe(take(1)).subscribe((subscriptions) => {
          this.afs
            .doc<MajorEventItem>(`majorEvents/${this.eventID}`)
            .valueChanges()
            .pipe(take(1))
            .subscribe((event) => {
              if (!event) {
                return;
              }

              let events: Observable<EventItem | undefined>[] = [];
              let eventsArray: Observable<(EventItem | undefined)[]>;
              let eventNames: { [key: string]: string } = {};

              event.events.forEach((event) => {
                events.push(this.afs.doc<EventItem>(`events/${event}`).valueChanges({ idField: 'id' }).pipe(take(1)));
              });

              eventsArray = forkJoin(events);

              eventsArray.pipe(take(1)).subscribe((events) => {
                events.forEach((event) => {
                  if (!event || !event.id) {
                    return;
                  }

                  eventNames[event.id] = event.name.replace(/[",;]/g, '');
                });

                subscriptions.forEach((item) => {
                  const user = users.find((user) => user.uid === item.id);

                  let status = 'Status não cadastrado';

                  switch (item.payment.status) {
                    case 0:
                      status = 'Aguardando envio do comprovante';
                      break;
                    case 1:
                      status = 'Comprovante em análise';
                      break;
                    case 2:
                      status = 'Pago e validado';
                      break;
                    case 3:
                      status = 'Devolvido por erro no comprovante';
                      break;
                    case 4:
                      status = 'Devolvido por falta de vagas';
                      break;
                    case 5:
                      status = 'Devolvido por choque de horário';
                      break;
                  }

                  let subscribedToEventsItemArray$: Observable<EventItem | undefined>[] = [];

                  // TODO: Optimize this
                  item.subscribedToEvents.forEach((eventID) => {
                    subscribedToEventsItemArray$.push(
                      this.afs
                        .collection('events')
                        .doc<EventItem>(eventID)
                        .get()
                        .pipe(
                          take(1),
                          map((doc) => doc.data())
                        )
                    );
                  });

                  let subscribedToEventsNames = '';

                  item.subscribedToEvents.forEach((eventID) => {
                    subscribedToEventsNames += '""' + eventNames[eventID] + '""; ';
                  });

                  if (!user) {
                    const row = [
                      item.id,
                      'Usuário não encontrado',
                      '',
                      '',
                      '',
                      '',
                      item.payment.status,
                      status,
                      this.getDateFromTimestamp(item.payment.time).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }),

                      this.getDateFromTimestamp(item.payment.time).toISOString(),

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

                      item.subscribedToEvents.join('; '),
                      subscribedToEventsNames,
                    ];
                    csv.push(row);
                    return;
                  }

                  const row = [
                    user.uid,
                    user.displayName,
                    user.fullName || '',
                    user.associateStatus || '',
                    user.academicID || 'Sem RA cadastrado',
                    user.email || '',
                    item.payment.status,
                    status,

                    this.getDateFromTimestamp(item.payment.time).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }),

                    this.getDateFromTimestamp(item.payment.time).toISOString(),

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

                    item.subscribedToEvents.join('; '),
                    subscribedToEventsNames,
                  ];
                  csv.push(row);
                });

                this.event$.pipe(take(1)).subscribe((event) => {
                  const csvString = csv.map((row) => row.join(',')).join('\n');
                  const a = document.createElement('a');
                  a.href = window.URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }));
                  a.download = `${event.name}_${new Date().toISOString()}.csv`;
                  a.click();
                  this.disableCSVDownloadButton = false;
                });
              });
            });
        });
      });
  }
}
