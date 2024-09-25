import { GroupCreationModalComponent } from './components/group-creation-modal/group-creation-modal.component';
import { IonText, ModalController } from '@ionic/angular/standalone';
// @ts-strict-ignore
import { GlobalConstantsService } from '../../shared/services/global-constants.service';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { User } from '../../shared/services/user';
import { EventSubscription } from '../../shared/services/event';
import { arrayRemove, arrayUnion, deleteField, serverTimestamp } from '@angular/fire/firestore';
import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { addYears, endOfMonth, parseISO, startOfMonth } from 'date-fns';
import { BehaviorSubject, combineLatest, map, Observable, switchMap, take } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { EmojiService } from '../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

import {
  IonRouterLink,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonButton,
  IonIcon,
  IonContent,
  IonDatetimeButton,
  IonList,
  IonItem,
  IonGrid,
  IonRow,
  IonCol,
  IonLabel,
  IonCheckbox,
  IonProgressBar,
  IonFooter,
  IonPopover,
  IonModal,
  IonDatetime,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe } from '@angular/common';

interface EventItemQuery extends EventItem {
  inMajorEventName?: Observable<string>;
}

@Component({
  selector: 'app-manage-events',
  templateUrl: './manage-events.page.html',
  styleUrls: ['./manage-events.page.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    RouterLink,
    IonText,
    IonRouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonDatetimeButton,
    IonList,
    IonItem,
    IonGrid,
    IonRow,
    IonCol,
    IonLabel,
    IonCheckbox,
    IonProgressBar,
    IonFooter,
    IonPopover,
    IonModal,
    IonDatetime,
    FormsModule,
    DatePipe,
  ],
})
export class PageManageEvents implements OnInit {
  groupUnderSelection = false;
  dataForm: FormGroup;
  today: Date = new Date();
  currentMonth: string = this.today.toISOString();
  currentMonth$ = new BehaviorSubject<string | null>(this.currentMonth);
  events$: Observable<EventItemQuery[]>;
  constructor(
    private afs: AngularFirestore,
    public courses: CoursesService,
    private alertController: AlertController,
    private toastController: ToastController,
    public emojiService: EmojiService,
    public dateService: DateService,
    private formBuilder: FormBuilder,
    private modalController: ModalController,
  ) {
    this.dataForm = this.formBuilder.group({
      selectedCheckboxes: this.formBuilder.array([]),
    });
  }

  ngOnInit() {
    this.events$ = combineLatest([this.currentMonth$]).pipe(
      switchMap(([date]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                const eventObject: EventItemQuery = event;
                if (eventObject.inMajorEvent)
                  eventObject.inMajorEventName = this.getMajorEventName$(event.inMajorEvent);
                return eventObject;
              }),
            ),
          );
      }),
    );
  }

  getMajorEventName$(eventID: string): Observable<string> {
    return this.afs
      .collection<MajorEventItem>('majorEvents')
      .doc(eventID)
      .get()
      .pipe(
        take(1),
        map((doc) => doc.data()?.name),
      );
  }

  getLimitDate(): string {
    return addYears(this.today, 1).toISOString();
  }

  onMonthChange() {
    this.currentMonth$.next(this.currentMonth);
  }

  async confirmOpenOnlineAttendance(event: EventItem) {
    const alert = await this.alertController.create({
      header: 'Deseja abrir presença?',
      subHeader: `${event.name}`,
      message: `Data do evento: ${this.dateService.getDateFromTimestamp(event.eventStartDate).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
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
      header: 'Deseja encerrar presença?',
      subHeader: `${event.name}`,
      message: `Data do evento: ${this.dateService.getDateFromTimestamp(event.eventStartDate).toLocaleString('pt-BR', {
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
    const bannedCodes = [
      '2222',
      '3333',
      '4444',
      '5555',
      '6666',
      '7777',
      '8888',
      '9999',
      'AAAA',
      'BBBB',
      'CCCC',
      'DDDD',
      'EEEE',
      'FFFF',
      'GGGG',
      'HHHH',
      'KKKK',
      'MMMM',
      'NNNN',
      'PPPP',
      'QQQQ',
      'RRRR',
      'SSSS',
      'TTTT',
      'WWWW',
      'XXXX',
      'YYYY',
      'ZZZZ',
      'PENS',
      'ANWS',
    ];
    let code: string;

    do {
      code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    } while (bannedCodes.includes(code));

    this.afs.doc<EventItem>(`events/${eventID}`).update({
      // @ts-expect-error - This works
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
            // @ts-expect-error - This works
            'pending.onlineAttendance': arrayUnion(eventID),
          });
        });
      });

    this.presentCode(code);
  }

  closeOnlineAttendance(eventID: string) {
    this.afs.doc<EventItem>(`events/${eventID}`).update({
      // @ts-expect-error - This works
      attendanceCollectionEnd: serverTimestamp(),
    });

    this.afs
      .collection<EventSubscription>(`events/${eventID}/subscriptions`)
      .get()
      .subscribe((subscriptions) => {
        subscriptions.forEach((subscription) => {
          this.afs.doc<User>(`users/${subscription.id}`).update({
            // @ts-expect-error - This works
            'pending.onlineAttendance': arrayRemove(eventID),
          });
        });
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCheckBoxChange(e: any, eventItem: EventItem) {
    const checkArray: FormArray = this.dataForm.get('selectedCheckboxes') as FormArray;

    if (e.target.checked) {
      checkArray.push(
        this.formBuilder.group({
          id: eventItem.id,
          icon: eventItem.icon,
          name: eventItem.name,
          eventStartDate: eventItem.eventStartDate,
          eventEndDate: eventItem.eventEndDate,
        }),
      );
    } else {
      let i = 0;
      checkArray.controls.forEach((item: FormGroup) => {
        if (item.controls['id'].value === eventItem.id) {
          checkArray.removeAt(i);
          return;
        }
        i++;
      });
    }
  }

  groupEventToolbarText(length: number): string {
    switch (length) {
      case 0:
        return 'Nenhum evento selecionado';
      case 1:
        return 'Apenas 1 evento selecionado';
      default:
        return `Agrupar ${length} eventos`;
    }
  }

  cancelGroupSelection() {
    this.groupUnderSelection = false;
    const formArray = this.dataForm.get('selectedCheckboxes') as FormArray;
    formArray.clear();
  }

  async confirmEventGroupDelete(event: EventItem) {
    const alert = await this.alertController.create({
      header: 'Deseja deletar o grupo?',
      subHeader: `${event.eventGroup?.groupDisplayName}`,
      message: `Um grupo só deve ser deletado se ocorreu algum engano em sua criação. Erros acontecerão se o grupo tiver certificados emitidos. Este grupo contém ${event.eventGroup.groupEventIDs.length} eventos.`,
      buttons: [
        {
          text: 'Cancelar',
        },
        {
          text: 'Sim',
          handler: () => {
            this.deleteEventGroup(event.id);
          },
        },
      ],
    });

    await alert.present();
  }

  deleteEventGroup(eventID: string) {
    this.afs
      .collection<EventItem>(`events`, (ref) => ref.where('eventGroup.groupEventIDs', 'array-contains', eventID))
      .get()
      .subscribe((events) => {
        events.forEach((event) => {
          this.afs.doc<EventItem>(`events/${event.id}`).update({
            // @ts-expect-error - This works
            eventGroup: deleteField(),
          });
        });
      });
  }

  async openCreateEventGroupModal() {
    const modal = await this.modalController.create({
      component: GroupCreationModalComponent,
      componentProps: {
        eventGroup: this.dataForm.get('selectedCheckboxes').value,
      },
      backdropDismiss: false,
    });

    modal.onDidDismiss().then(() => {
      this.cancelGroupSelection();
    });

    return await modal.present();
  }
}
