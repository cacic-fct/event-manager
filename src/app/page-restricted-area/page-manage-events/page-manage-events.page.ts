import { GlobalConstantsService } from './../../shared/services/global-constants.service';
import { AlertController, ToastController } from '@ionic/angular';
import { User } from './../../shared/services/user';
import { EventSubscription } from './../../shared/services/event';
import { arrayRemove, arrayUnion, serverTimestamp } from '@angular/fire/firestore';
import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { addYears, endOfMonth, fromUnixTime, parseISO, startOfMonth } from 'date-fns';
import { BehaviorSubject, combineLatest, map, Observable, switchMap, take } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { Timestamp } from '@firebase/firestore-types';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

interface EventItemQuery extends EventItem {
  inMajorEventName?: Observable<string>;
}

@Component({
  selector: 'app-page-manage-events',
  templateUrl: './page-manage-events.page.html',
  styleUrls: ['./page-manage-events.page.scss'],
})
export class PageManageEvents implements OnInit {
  today: Date = new Date();
  currentMonth: string = this.today.toISOString();
  currentMonth$: BehaviorSubject<string | null> = new BehaviorSubject(this.currentMonth);
  events$: Observable<EventItemQuery[]>;
  constructor(
    private afs: AngularFirestore,
    public courses: CoursesService,
    private sanitizer: DomSanitizer,
    private alertController: AlertController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.events$ = combineLatest([this.currentMonth$]).pipe(
      switchMap(([date]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            query = query
              .where('eventStartDate', '<=', endOfMonth(parseISO(date)))
              .where('eventStartDate', '>=', startOfMonth(parseISO(date)));
            return query;
          })
          .valueChanges({ idField: 'id' })
          .pipe(
            trace('firestore'),
            map((events) =>
              events.map((event) => {
                let eventObject: EventItemQuery = event;
                if (eventObject.inMajorEvent)
                  eventObject.inMajorEventName = this.getMajorEventName$(event.inMajorEvent);
                return eventObject;
              })
            )
          );
      })
    );
  }

  getMajorEventName$(eventID: string): Observable<string> {
    return this.afs
      .collection<MajorEventItem>('majorEvents')
      .doc(eventID)
      .get()
      .pipe(
        take(1),
        map((doc) => doc.data()?.name)
      );
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  getLimitDate(): string {
    return addYears(this.today, 1).toISOString();
  }

  onMonthChange() {
    this.currentMonth$.next(this.currentMonth);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined || !/^\p{Emoji}|\p{Emoji_Modifier}$/u.test(emoji)) {
      // TODO: validar apenas 1 emoji
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  async confirmOpenOnlineAttendance(event: EventItem) {
    const alert = await this.alertController.create({
      header: 'Deseja abrir presença?',
      subHeader: `${event.name}`,
      message: `Data do evento: ${this.getDateFromTimestamp(event.eventStartDate).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`,
      buttons: [
        {
          text: 'Não',
        },
        {
          text: 'Sim',
          handler: () => {
            this.openOnlineAttendance(event.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async copyCode(code: string) {
    navigator.clipboard.writeText(code);
    const toast = await this.toastController.create({
      message: 'Código copiado',
      icon: 'copy',
      duration: 3000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  async presentCode(code: string) {
    const alert = await this.alertController.create({
      header: 'Código de presença',
      message: code,
      buttons: [
        'OK',
        {
          text: 'Copiar',
          handler: () => {
            navigator.clipboard.writeText(code);
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmCloseOnlineAttendance(event: EventItem) {
    const alert = await this.alertController.create({
      header: 'Deseja fechar presença?',
      subHeader: `${event.name}`,
      message: `Data do evento: ${this.getDateFromTimestamp(event.eventStartDate).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`,
      buttons: [
        {
          text: 'Não',
        },
        {
          text: 'Sim',
          handler: () => {
            this.closeOnlineAttendance(event.id);
          },
        },
      ],
    });

    await alert.present();
  }

  openOnlineAttendance(eventID: string) {
    const alphabet = GlobalConstantsService.nonAmbiguousAlphabetCapitalizedNumbers;
    const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    this.afs.doc<EventItem>(`events/${eventID}`).update({
      // @ts-ignore
      attendanceCollectionStart: serverTimestamp(),
      attendanceCollectionEnd: null,
      attendanceCode: code,
    });

    this.afs
      .collection<EventSubscription>(`events/${eventID}/subscriptions`)
      .get()
      .subscribe((subscriptions) => {
        subscriptions.forEach((subscription) => {
          this.afs.doc<User>(`users/${subscription.id}`).update({
            // @ts-ignore
            'pending.onlineAttendance': arrayUnion(eventID),
          });
        });
      });

    this.presentCode(code);
  }

  closeOnlineAttendance(eventID: string) {
    this.afs.doc<EventItem>(`events/${eventID}`).update({
      // @ts-ignore
      attendanceCollectionEnd: serverTimestamp(),
    });

    this.afs
      .collection<EventSubscription>(`events/${eventID}/subscriptions`)
      .get()
      .subscribe((subscriptions) => {
        subscriptions.forEach((subscription) => {
          this.afs.doc<User>(`users/${subscription.id}`).update({
            // @ts-ignore
            'pending.onlineAttendance': arrayRemove(eventID),
          });
        });
      });
  }
}
