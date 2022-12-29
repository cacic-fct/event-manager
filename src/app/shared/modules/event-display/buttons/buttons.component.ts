import { DateService } from './../../../services/date.service';
import { ToastController } from '@ionic/angular';
import { Component, Input, OnInit } from '@angular/core';
import { map, Observable, take } from 'rxjs';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { EventItem } from '../../../services/event';
import { serverTimestamp } from '@angular/fire/firestore';
import { trace } from '@angular/fire/compat/performance';

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

  userID: string | undefined;
  subscribedToEvent: boolean | undefined;
  isUserAuthenticated: Observable<boolean>;
  constructor(
    private toastController: ToastController,
    private afs: AngularFirestore,
    private auth: AngularFireAuth,
    public dateService: DateService
  ) {
    this.isUserAuthenticated = this.auth.user.pipe(
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
    this.auth.user.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.afs
          .doc(`events/${this.eventItem.id}/subscriptions/${user.uid}`)
          .get()
          .subscribe((doc) => {
            this.subscribedToEvent = doc.exists;
          });
      }
    });
  }

  ngOnInit() {}

  subscribeToEvent() {
    if (this.eventItem.eventGroup?.groupEventIDs) {
      this.eventItem.eventGroup.groupEventIDs.forEach((eventID) => {
        this.auth.user.subscribe((user) => {
          if (!user) {
            return;
          }
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
      });
    } else {
      this.auth.user.subscribe((user) => {
        if (!user) {
          return;
        }
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
      });
    }
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
