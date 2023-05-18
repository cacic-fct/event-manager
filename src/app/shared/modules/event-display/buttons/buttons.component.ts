import { EventItem } from 'src/app/shared/services/event';
import { DateService } from './../../../services/date.service';
import { ToastController } from '@ionic/angular';
import { Component, inject, Input, OnInit } from '@angular/core';
import { map, Observable, take } from 'rxjs';
import { AngularFirestore } from '@angular/fire/compat/firestore';

import { serverTimestamp } from '@angular/fire/firestore';
import { trace } from '@angular/fire/compat/performance';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Auth, user } from '@angular/fire/auth';

@UntilDestroy()
/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-display-buttons[eventItem]',
  templateUrl: './buttons.component.html',
  styleUrls: ['./buttons.component.scss'],
})
export class ButtonsComponent implements OnInit {
  @Input() eventItem!: EventItem;
  @Input() displaySubscriptionAttendanceButtons: boolean | undefined;

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  userID: string | undefined;
  subscribedToEvent: boolean | undefined;
  isUserAuthenticated: Observable<boolean>;
  disableSubscriptionNoSlotsLeft: boolean = false;

  constructor(
    private toastController: ToastController,
    private afs: AngularFirestore,
    public dateService: DateService
  ) {
    this.isUserAuthenticated = this.user$.pipe(
      trace('auth'),
      map((user) => {
        if (user?.uid) {
          this.userID = user.uid;
          return true;
        }
        return false;
      })
    );

    // Check if user is already subscribed to event
    this.user$.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.afs
          .doc(`events/${this.eventItem.id}/subscriptions/${user.uid}`)
          .get()
          .pipe(untilDestroyed(this))
          .subscribe((doc) => {
            this.subscribedToEvent = doc.exists;
          });
      }
    });
  }

  ngOnInit() {
    this.afs
      .doc<EventItem>(`events/${this.eventItem.id}`)
      .get()
      .pipe(untilDestroyed(this))
      .subscribe((doc) => {
        const event = doc.data();

        if (!event) {
          this.disableSubscriptionNoSlotsLeft = true;
        }

        if (event!.numberOfSubscriptions && event!.slotsAvailable) {
          if (event!.numberOfSubscriptions >= event!.slotsAvailable) {
            this.disableSubscriptionNoSlotsLeft = true;
          }
        }
      });
  }

  subscribeToEvent() {
    if (this.disableSubscriptionNoSlotsLeft === true) {
      return;
    }
    this.user$.subscribe((user) => {
      if (!user) {
        return;
      }
      if (this.eventItem.eventGroup?.groupEventIDs) {
        this.eventItem.eventGroup.groupEventIDs.forEach((eventID) => {
          this.afs
            .doc(`events/${eventID}/subscriptions/${user.uid}`)
            .set({
              // @ts-ignore
              time: serverTimestamp(),
            })
            .then(() => {
              this.afs
                .doc(`users/${user.uid}/eventSubscriptions/${eventID}`)
                .set({
                  reference: this.afs.doc(`events/${eventID}`).ref,
                })
                .then(() => {
                  this.presentToastSubscribe();
                  this.subscribedToEvent = true;
                });
            });
        });
      } else {
        this.afs
          .doc(`events/${this.eventItem.id}/subscriptions/${user.uid}`)
          .set({
            // @ts-ignore
            time: serverTimestamp(),
          })
          .then(() => {
            this.afs
              .doc(`users/${user.uid}/eventSubscriptions/${this.eventItem.id}`)
              .set({
                reference: this.afs.doc(`events/${this.eventItem.id}`).ref,
              })
              .then(() => {
                this.presentToastSubscribe();
                this.subscribedToEvent = true;
              });
          });
      }
    });
  }

  async presentToastSubscribe() {
    const toast = await this.toastController.create({
      header: 'Você se inscreveu no evento',
      icon: 'checkmark-circle',
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
    toast.present();
  }
}
