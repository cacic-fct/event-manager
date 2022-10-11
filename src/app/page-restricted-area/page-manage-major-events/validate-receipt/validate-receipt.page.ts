import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { increment } from '@angular/fire/firestore';
import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { fromUnixTime } from 'date-fns';
import { Observable, map, take, combineLatest } from 'rxjs';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { User } from 'src/app/shared/services/user';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { trace } from '@angular/fire/compat/performance';
import { EventItem } from 'src/app/shared/services/event';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { AlertController, IonModal } from '@ionic/angular';
import { serverTimestamp } from '@angular/fire/firestore';

@UntilDestroy()
@Component({
  selector: 'app-validate-receipt',
  templateUrl: './validate-receipt.page.html',
  styleUrls: ['./validate-receipt.page.scss'],
})
export class ValidateReceiptPage implements OnInit {
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
    private auth: AngularFireAuth,
    private formBuilder: FormBuilder,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.majorEventID = this.route.snapshot.paramMap.get('eventId');
    const eventRef = this.afs.collection('majorEvents').doc<MajorEventItem>(this.majorEventID);
    this.eventName$ = eventRef.valueChanges().pipe(map((event) => event.name));
    this.subscriptionsQuery = eventRef.collection<Subscription>('subscriptions', (ref) =>
      ref.where('payment.status', '==', 1).orderBy('payment.time').limit(10)
    );
    this.subscriptions$ = this.subscriptionsQuery.valueChanges({ idField: 'id' }).pipe(
      untilDestroyed(this),
      trace('firestore'),
      map((subscription) =>
        subscription.map((sub) => {
          const arrayOfEvents: Observable<EventItem>[] = sub.subscribedToEvents.map((subEventID) =>
            this.afs.collection('events').doc<EventItem>(subEventID).valueChanges().pipe(take(1), trace('firestore'))
          );

          let observableArrayOfEvents: Observable<EventItem[]> = combineLatest(arrayOfEvents);

          observableArrayOfEvents = observableArrayOfEvents.pipe(
            map((events) => {
              return events.sort((a, b) => {
                return a.eventStartDate.toMillis() - b.eventStartDate.toMillis();
              });
            })
          );

          return {
            ...sub,
            subEventsInfo: observableArrayOfEvents,
            userDisplayName$: this.userNameByID(sub.id),
          };
        })
      )
    );
    this.imgBaseHref = [this.majorEventID, 'payment-receipts'].join('/');
    this.refuseForm = this.formBuilder.group(
      {
        errorMessage: '',
        radioGroup: ['', Validators.required],
      },
      {
        validators: [this.validatorRadio],
      }
    );
  }

  imgURL(receiptId: string): string {
    return [this.imgBaseHref, receiptId].join('/');
  }

  private userNameByID(userId: string): Observable<string> {
    return this.afs
      .collection('users')
      .doc<User>(userId)
      .valueChanges()
      .pipe(
        take(1),
        map((user) => user.fullName || user.displayName)
      );
  }

  getDateFromTimestamp(timestamp: TimestampType): Date {
    return fromUnixTime(timestamp.seconds);
  }

  confirm() {
    this.auth.user.pipe(take(1)).subscribe((adminUser) => {
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

          // For every event the user subscribed to, decrement the available slots
          this.subscriptionsQuery
            .doc(subscriberID)
            .valueChanges()
            .pipe(take(1))
            .subscribe((sub) => {
              sub.subscribedToEvents.forEach((eventID) => {
                this.afs
                  .collection('events')
                  .doc<EventItem>(eventID)
                  .update({
                    // @ts-ignore
                    slotsAvailable: increment(-1),
                    // @ts-ignore
                    numberOfSubscriptions: increment(1),
                  });

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

    this.auth.user.pipe(take(1)).subscribe((user) => {
      this.subscriptionsQuery
        .get()
        .pipe(take(1), trace('firestore'))
        .subscribe((col) => {
          const subscriberID = col.docs[this.arrayIndex].id;

          const docQuery = this.afs.doc(`users/${subscriberID}`).get();

          if (this.refuseForm.value.radioGroup === 'invalidReceipt') {
            this.subscriptionsQuery.doc(subscriberID).update({
              // @ts-ignore
              'payment.status': 3, // Novo status: erro personalizado
              'payment.time': serverTimestamp(),
              'payment.author': user.uid,
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
                    this.refuseForm.get('errorMessage').value
                  );
                });
              });
          } else if (this.refuseForm.value.radioGroup === 'noSlots') {
            this.subscriptionsQuery.doc(subscriberID).update({
              // @ts-ignore
              'payment.status': 4,
              'payment.time': serverTimestamp(),
              'payment.author': user.uid,
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
            // Format phone from 11 99999-9999 to 5511999999999
            let formattedPhone = phone.replace(/\D/g, '');
            formattedPhone = formattedPhone.replace(/^(\d{2})(\d)/g, '55$1$2');

            const text: string = `Olá, ${name}! O seu comprovante de pagamento do evento "${event}" foi recusado.%0aA justificativa é "${message}".%0a%0aRealize o envio novamente pelo link:%0ahttps://fct-pp.web.app/inscricoes/pagar/${this.majorEventID}?utm_source=whatsapp%26utm_medium=message%26utm_campaign=payment_error`;

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
            // Format phone from 11 99999-9999 to 5511999999999
            let formattedPhone = phone.replace(/\D/g, '');
            formattedPhone = formattedPhone.replace(/^(\d{2})(\d)/g, '55$1$2');

            const text: string = `Olá, ${name}! Ocorreu um problema com a sua inscrição no evento "${event}".%0aNão há mais vagas em uma das atividades selecionadas.%0a%0aVocê precisa editar a sua inscrição pelo link:%0ahttps://fct-pp.web.app/eventos/inscrever/${this.majorEventID}?utm_source=whatsapp%26utm_medium=message%26utm_campaign=no_slots`;
            const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${text}`;
            window.open(url, '_blank');
          },
        },
      ],
    });

    await alert.present();
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
}

interface Subscription {
  id: string;
  userDisplayName$: Observable<string>;
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
}
