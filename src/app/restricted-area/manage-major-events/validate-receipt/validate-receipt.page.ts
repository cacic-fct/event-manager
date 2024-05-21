// @ts-strict-ignore
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { Observable, map, take, combineLatest } from 'rxjs';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { User } from 'src/app/shared/services/user';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { trace } from '@angular/fire/compat/performance';
import { EventItem } from 'src/app/shared/services/event';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { serverTimestamp } from '@angular/fire/firestore';
import { DateService } from 'src/app/shared/services/date.service';
import { Auth, user } from '@angular/fire/auth';

import { Storage, ref } from '@angular/fire/storage';
import { getDownloadURL } from '@angular/fire/storage';

import {
  AlertController,
  ToastController,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonRow,
  IonIcon,
  IonText,
  IonFab,
  IonFabButton,
  IonFabList,
  IonProgressBar,
  IonModal,
  IonContent,
  IonItem,
  IonRadioGroup,
  IonRadio,
  IonLabel,
  IonCardContent,
  IonInput,
} from '@ionic/angular/standalone';
import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';

import { environment } from 'src/environments/environment';

@UntilDestroy()
@Component({
  selector: 'app-validate-receipt',
  templateUrl: './validate-receipt.page.html',
  styleUrls: ['./validate-receipt.page.scss'],
  standalone: true,
  imports: [
    IonInput,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonRow,
    IonIcon,
    IonText,
    IonFab,
    IonFabButton,
    IonFabList,
    IonProgressBar,
    IonModal,
    IonContent,
    IonItem,
    IonRadioGroup,
    IonRadio,
    IonLabel,
    IonCardContent,
    AsyncPipe,
    ReactiveFormsModule,
    SweetAlert2Module,
    CurrencyPipe,
    DatePipe,
  ],
})
export class ValidateReceiptPage implements OnInit {
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  private readonly storage: Storage = inject(Storage);

  private majorEventID: string;
  public eventName$: Observable<string>;
  private subscriptionsQuery: AngularFirestoreCollection<Subscription>;
  public subscriptions$: Observable<Subscription[]>;
  public imgBaseHref: string;
  refuseForm: FormGroup;
  @ViewChild('swalConfirm') private swalConfirm: SwalComponent;
  @ViewChild('refuseModal') private refuseModal: IonModal;

  arrayIndex: number = 0;

  constructor(
    private route: ActivatedRoute,
    private afs: AngularFirestore,
    private formBuilder: FormBuilder,
    private alertController: AlertController,
    public dateService: DateService,
    private toastController: ToastController,
  ) {}

  ngOnInit() {
    this.majorEventID = this.route.snapshot.paramMap.get('eventId');
    const eventRef = this.afs.collection('majorEvents').doc<MajorEventItem>(this.majorEventID);
    this.eventName$ = eventRef.valueChanges().pipe(map((event) => event.name));
    this.subscriptionsQuery = eventRef.collection<Subscription>('subscriptions', (ref) =>
      ref.where('payment.status', '==', 1).orderBy('payment.time'),
    );
    this.subscriptions$ = this.subscriptionsQuery.valueChanges({ idField: 'id' }).pipe(
      untilDestroyed(this),
      trace('firestore'),
      map((subscription) =>
        subscription.map((sub) => {
          const arrayOfEvents: Observable<EventItem>[] = sub.subscribedToEvents.map((subEventID) =>
            this.afs
              .collection('events')
              .doc<EventItem>(subEventID)
              .valueChanges({ idField: 'id' })
              .pipe(take(1), trace('firestore')),
          );

          let observableArrayOfEvents: Observable<EventItem[]> = combineLatest(arrayOfEvents);

          observableArrayOfEvents = observableArrayOfEvents.pipe(
            map((events) => {
              return events.sort((a, b) => {
                return a.eventStartDate.toMillis() - b.eventStartDate.toMillis();
              });
            }),
          );

          return {
            ...sub,
            subEventsInfo: observableArrayOfEvents,
            userData$: this.userDataByID(sub.id),
            image: this.imgURL(sub.id),
          };
        }),
      ),
    );
    this.imgBaseHref = [this.majorEventID, 'payment-receipts'].join('/');
    this.refuseForm = this.formBuilder.group(
      {
        errorMessage: '',
        radioGroup: ['', Validators.required],
      },
      {
        validators: [this.validatorRadio],
      },
    );
  }

  async imgURL(receiptId: string): Promise<string> {
    const reference = ref(this.storage, [this.imgBaseHref, receiptId].join('/'));
    try {
      const url = await getDownloadURL(reference);
      return url;
    } catch (error) {
      console.log(error);
      return '';
    }
  }

  private userDataByID(userId: string): Observable<User> {
    return this.afs.collection('users').doc<User>(userId).valueChanges().pipe(take(1));
  }

  confirm() {
    this.user$.pipe(take(1)).subscribe((adminUser) => {
      this.subscriptionsQuery
        .get()
        .pipe(take(1), trace('firestore'))
        .subscribe((col) => {
          const subscriberID = col.docs[this.arrayIndex].id;
          this.subscriptionsQuery.doc(subscriberID).update({
            // @ts-ignore
            'payment.status': 2, // Novo status: pagamento aprovado
            'payment.time': serverTimestamp(),
            'payment.author': adminUser.uid, // Autor da mudança
          });

          // TODO: Move this to a cloud function
          this.subscriptionsQuery
            .doc(subscriberID)
            .valueChanges()
            .pipe(take(1))
            .subscribe((sub) => {
              sub.subscribedToEvents.forEach((eventID) => {
                this.afs
                  .collection('events')
                  .doc<EventItem>(eventID)
                  .collection('subscriptions')
                  .doc(subscriberID)
                  .set({
                    // @ts-ignore
                    time: serverTimestamp(),
                  });

                this.afs
                  .collection('users')
                  .doc<User>(subscriberID)
                  .collection('eventSubscriptions')
                  .doc(eventID)
                  .set({
                    reference: this.afs
                      .collection('events')
                      .doc<EventItem>(eventID)
                      .collection('subscriptions')
                      .doc(eventID).ref,
                    belongsToMajorEvent: this.majorEventID,
                  });
              });
            });

          if (this.arrayIndex > 0) {
            this.arrayIndex--;
          }

          this.swalConfirm.fire();
          setTimeout(() => {
            this.swalConfirm.close();
          }, 1000);
        });
    });
  }

  refuse() {
    if (this.refuseForm.invalid) {
      return;
    }

    this.user$.pipe(take(1)).subscribe((user) => {
      this.subscriptionsQuery
        .get()
        .pipe(take(1), trace('firestore'))
        .subscribe((col) => {
          const subscriberID = col.docs[this.arrayIndex].id;

          const docQuery = this.afs.doc(`users/${subscriberID}`).get();

          switch (this.refuseForm.value.radioGroup) {
            case 'invalidReceipt':
              this.subscriptionsQuery.doc(subscriberID).update({
                // @ts-ignore
                'payment.status': 3,
                'payment.validationTime': serverTimestamp(),
                'payment.validationAuthor': user.uid,
                'payment.error': this.refuseForm.get('errorMessage').value,
              });

              this.refuseModal.dismiss();

              this.afs
                .doc(`majorEvents/${this.majorEventID}`)
                .get()
                .pipe(take(1), trace('firestore'))
                .subscribe((doc) => {
                  const event = doc.data() as MajorEventItem;
                  const eventName = event.name;

                  docQuery.pipe(take(1), trace('firestore')).subscribe((userDoc) => {
                    const user = userDoc.data() as User;
                    // Only first name from fullName
                    const firstName = user.fullName.split(' ')[0];

                    this.whatsAppAlertInvalid(
                      firstName,
                      user.phone,
                      eventName,
                      this.refuseForm.get('errorMessage').value,
                    );
                  });
                });
              break;
            case 'noSlots':
              this.subscriptionsQuery.doc(subscriberID).update({
                // @ts-ignore
                'payment.status': 4,
                'payment.validationTime': serverTimestamp(),
                'payment.validationAuthor': user.uid,
              });
              this.refuseModal.dismiss();

              this.afs
                .doc(`majorEvents/${this.majorEventID}`)
                .get()
                .pipe(take(1), trace('firestore'))
                .subscribe((doc) => {
                  const event = doc.data() as MajorEventItem;
                  const eventName = event.name;

                  docQuery.pipe(take(1), trace('firestore')).subscribe((userDoc) => {
                    const user = userDoc.data() as User;
                    // Only first name from fullName
                    const firstName = user.fullName.split(' ')[0];

                    this.whatsAppAlertNoSlots(firstName, user.phone, eventName);
                  });

                  if (this.arrayIndex > 0) {
                    this.arrayIndex--;
                  }
                });
              break;

            case 'scheduleConflict':
              this.subscriptionsQuery.doc(subscriberID).update({
                // @ts-ignore
                'payment.status': 5,
                'payment.validationTime': serverTimestamp(),
                'payment.validationAuthor': user.uid,
                subscribedToEvents: [],
              });
              this.refuseModal.dismiss();

              this.afs
                .doc(`majorEvents/${this.majorEventID}`)
                .get()
                .pipe(take(1), trace('firestore'))
                .subscribe((doc) => {
                  const event = doc.data() as MajorEventItem;
                  const eventName = event.name;

                  docQuery.pipe(take(1), trace('firestore')).subscribe((userDoc) => {
                    const user = userDoc.data() as User;
                    // Only first name from fullName
                    const firstName = user.fullName.split(' ')[0];

                    this.whatsAppAlertScheduleConflict(firstName, user.phone, eventName);
                  });

                  if (this.arrayIndex > 0) {
                    this.arrayIndex--;
                  }
                });

              break;
          }
        });
    });
  }

  async whatsAppAlertInvalid(name: string, phone: string, event: string, message: string) {
    const alert = await this.alertController.create({
      header: 'Enviar notificação por WhatsApp?',
      message: 'Envie uma mensagem para o usuário informando que o pagamento foi recusado.',
      buttons: [
        {
          text: 'Não',
          role: 'cancel',
        },
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            const formattedPhone = this.formatPhoneWhatsApp(phone);

            const text: string = `Olá, ${name}! O seu comprovante de pagamento do evento "${event}" foi recusado.%0aA justificativa é "${message}".%0a%0aRealize o envio novamente pelo link:%0a${environment.baseUrl}inscricoes/pagar/${this.majorEventID}?utm_source=whatsapp%26utm_medium=message%26utm_campaign=payment_error`;

            const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${text}`;
            window.open(url, '_blank');
          },
        },
      ],
    });

    await alert.present();
  }

  async whatsAppAlertNoSlots(name: string, phone: string, event: string) {
    const alert = await this.alertController.create({
      header: 'Enviar notificação por WhatsApp?',
      message: 'Envie uma mensagem para o usuário informando que não há mais vagas em um evento selecionado.',
      buttons: [
        {
          text: 'Não',
          role: 'cancel',
        },
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            const formattedPhone = this.formatPhoneWhatsApp(phone);

            const text: string = `Olá, ${name}! Ocorreu um problema com a sua inscrição no evento "${event}".%0aNão há mais vagas em uma das atividades selecionadas.%0a%0aVocê precisa editar a sua inscrição pelo link:%0a${environment.baseUrl}eventos/inscrever/${this.majorEventID}?utm_source=whatsapp%26utm_medium=message%26utm_campaign=no_slots`;
            const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${text}`;
            window.open(url, '_blank');
          },
        },
      ],
    });

    await alert.present();
  }

  async whatsAppAlertScheduleConflict(name: string, phone: string, event: string) {
    const alert = await this.alertController.create({
      header: 'Enviar notificação por WhatsApp?',
      message: 'Envie uma mensagem para o usuário informando sobre o choque de horário.',
      buttons: [
        {
          text: 'Não',
          role: 'cancel',
        },
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            const formattedPhone = this.formatPhoneWhatsApp(phone);

            const text: string = `Olá, ${name}! Ocorreu um problema com a sua inscrição no evento "${event}".%0aHá um choque de horário nos eventos que você selecionou.%0a%0aVocê precisa editar a sua inscrição pelo link:%0a${environment.baseUrl}eventos/inscrever/${this.majorEventID}?utm_source=whatsapp%26utm_medium=message%26utm_campaign=schedule_conflict`;
            const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${text}`;
            window.open(url, '_blank');
          },
        },
      ],
    });

    await alert.present();
  }

  formatPhoneWhatsApp(phone: string): string {
    if (!phone) {
      return '';
    }
    // Format phone from 11 99999-9999 to 5511999999999
    let formattedPhone = phone.replace(/\D/g, '');
    formattedPhone = formattedPhone.replace(/^(\d{2})(\d)/g, '55$1$2');

    return formattedPhone;
  }

  validatorRadio(control: AbstractControl): ValidationErrors | null {
    if (control.get('radioGroup').value === 'invalidReceipt') {
      control.get('errorMessage').addValidators(Validators.required);
    } else {
      control.get('errorMessage').removeValidators(Validators.required);
    }

    control.get('errorMessage').updateValueAndValidity({ onlySelf: true });
    return null;
  }

  arrayIndexForward() {
    this.arrayIndex++;
  }

  arrayIndexBackward() {
    this.arrayIndex--;
  }

  async copyEventIDs(array: string[]) {
    let string = array.join('\n');

    // Remove all quotes and brackets
    string = string.replace(/[\[\]"]+/g, '');

    const toast = await this.toastController.create({
      header: 'IDs dos eventos',
      message: 'Copiados para a área de transferência.',
      icon: 'copy',
      position: 'bottom',
      duration: 2000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    navigator.clipboard.writeText(string);
    toast.present();
  }
}

interface Subscription {
  id: string;
  userData$: Observable<User>;
  time: TimestampType;
  payment: {
    status: number;
    time: TimestampType;
    error?: string;
    price?: number;
    author?: string;
  };
  subscriptionType: number;
  subscribedToEvents: string[];
  subEventsInfo: Observable<EventItem[]>;
  image: Promise<string>;
}
