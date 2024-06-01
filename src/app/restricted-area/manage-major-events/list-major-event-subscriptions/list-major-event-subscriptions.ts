import { Component, inject, ViewChild } from '@angular/core';
import { Firestore, collection, collectionData, docData, doc, query, orderBy } from '@angular/fire/firestore';
import { trace } from '@angular/fire/compat/performance';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { fromUnixTime } from 'date-fns';
import { Timestamp } from '@angular/fire/firestore';
import { map, Observable, take, forkJoin } from 'rxjs';
import { User } from 'src/app/shared/services/user';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventSubscription, MajorEventItem } from '../../../shared/services/major-event.service';
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
  IonSpinner,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';

interface Subscription extends MajorEventSubscription {
  id: string;
  time: Timestamp;
  user: Observable<User | undefined>;
}
@UntilDestroy()
@Component({
  selector: 'app-list-subscriptions',
  templateUrl: './list-major-event-subscriptions.html',
  styleUrls: ['./list-major-event-subscriptions.scss'],
  standalone: true,
  imports: [
    IonRouterLink,
    RouterLink,
    AsyncPipe,
    DecimalPipe,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonSpinner,
    IonItem,
    IonLabel,
    IonText,
    IonProgressBar,
    SweetAlert2Module,
  ],
})
export class ListMajorEventSubscriptionsPage {
  @ViewChild('mySwal')
  private mySwal!: SwalComponent;

  private firestore: Firestore = inject(Firestore);

  event$: Observable<MajorEventItem>;
  subscriptions$: Observable<Subscription[]>;

  eventID: string;

  disableCSVDownloadButton = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService,
    public dateService: DateService
  ) {
    this.eventID = this.route.snapshot.params['eventID'];

    const docRef = doc(this.firestore, 'majorEvents', this.eventID);
    this.event$ = docData(docRef) as Observable<MajorEventItem>;

    this.event$.pipe(untilDestroyed(this), trace('firestore')).subscribe((document) => {
      if (!document) {
        this.mySwal.fire();
        setTimeout(() => {
          this.router.navigate(['area-restrita/gerenciar-grandes-eventos']);
          this.mySwal.close();
        }, 1000);
      }
    });

    const colRef = collection(this.firestore, `majorEvents/${this.eventID}/subscriptions`);

    const colData = collectionData(query(colRef, orderBy('time')), { idField: 'id' }) as Observable<Subscription[]>;

    this.subscriptions$ = colData.pipe(
      untilDestroyed(this),
      trace('firestore'),
      map((subscription) =>
        subscription.map((item) => ({
          ...item,
          user: docData(doc(this.firestore, 'users', item.id)) as Observable<User | undefined>,
        }))
      )
    );
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  generateCSV() {
    this.disableCSVDownloadButton = true;

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
      const majorEventDoc = doc(this.firestore, 'majorEvents', this.eventID);
      const majorEventData = docData(majorEventDoc) as Observable<MajorEventItem | undefined>;

      majorEventData.pipe(take(1)).subscribe((event) => {
        if (!event) {
          return;
        }

        const events: Observable<MajorEventItem | undefined>[] = [];

        const eventNames: Record<string, string> = {};

        event.events.forEach((event) => {
          events.push(
            (
              docData(doc(this.firestore, 'events', event), { idField: 'id' }) as Observable<MajorEventItem | undefined>
            ).pipe(take(1))
          );
        });

        const eventsArray: Observable<(MajorEventItem | undefined)[]> = forkJoin(events);

        eventsArray.pipe(take(1)).subscribe((events) => {
          events.forEach((event) => {
            if (!event || !event.id) {
              return;
            }

            eventNames[event.id] = event.name.replace(/[",;]/g, '');
          });

          subscriptions.forEach((item) => {
            const user = docData(doc(this.firestore, 'users', item.id)) as Observable<User | undefined>;

            user.pipe(take(1)).subscribe((user) => {
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

              const subscribedToEventsItemArray$: Observable<MajorEventItem | undefined>[] = [];

              // TODO: Optimize this
              item.subscribedToEvents.forEach((eventID) => {
                const docRef = doc(this.firestore, 'events', eventID);
                const documentData = docData(docRef) as Observable<MajorEventItem | undefined>;

                subscribedToEventsItemArray$.push(documentData);
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
                  this.getDateFromTimestamp(item.payment.time)
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

                  this.getDateFromTimestamp(item.payment.time).toISOString(),

                  this.getDateFromTimestamp(item.time)
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

                this.getDateFromTimestamp(item.payment.time)
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

                this.getDateFromTimestamp(item.payment.time).toISOString(),

                this.getDateFromTimestamp(item.time)
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

                this.getDateFromTimestamp(item.time).toISOString(),

                item.subscribedToEvents.join('; '),
                subscribedToEventsNames,
              ];
              csv.push(row);
            });
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
  }
}
