// @ts-strict-ignore
import { ToastController, AlertController } from '@ionic/angular';
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { take, map, Observable } from 'rxjs';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { EventItem } from 'src/app/shared/services/event';
import { User } from 'src/app/shared/services/user';
import { fromUnixTime } from 'date-fns';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { Timestamp } from '@firebase/firestore-types';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

interface Attendance {
  user: Observable<User>;
  time: Timestamp;
  id?: string;
}

@UntilDestroy()
@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  @ViewChild('mySwal')
  private mySwal: SwalComponent;

  attendanceCollection$: Observable<Attendance[]>;
  eventID: string;
  event$: Observable<EventItem>;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService,
    private toastController: ToastController,
    private alertController: AlertController
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
          this.mySwal.fire();
          setTimeout(() => {
            this.router.navigate(['area-restrita/gerenciar-eventos']);
            this.mySwal.close();
          }, 1000);
        }
      });

    this.event$ = this.afs.collection('events').doc<EventItem>(this.eventID).valueChanges().pipe(trace('firestore'));

    this.attendanceCollection$ = this.afs
      .collection<Attendance>(`events/${this.eventID}/attendance`, (ref) => {
        return ref.orderBy('time', 'desc');
      })
      .valueChanges({ idField: 'id' })
      .pipe(
        untilDestroyed(this),
        trace('firestore'),
        map((attendance) => {
          return attendance.map((item) => {
            return {
              ...item,
              user: this.afs.collection('users').doc<User>(item.id).valueChanges().pipe(trace('firestore'), take(1)),
            };
          });
        })
      );
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  deleteAttendance(attendanceID: string) {
    this.afs
      .collection(`events/${this.eventID}/attendance`)
      .doc(attendanceID)
      .delete()
      .then(() => {
        this.deletedToast();
      });
  }

  async deleteAlert(attendanceID: string, username: string) {
    const alert = await this.alertController.create({
      header: 'Tem certeza que deseja remover essa presença?',
      message: username,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            this.deleteAttendance(attendanceID);
          },
        },
      ],
    });

    alert.present();
  }

  async deletedToast() {
    const toast = await this.toastController.create({
      message: 'Presença removida',
      duration: 2000,
      icon: 'checkmark-circle-outline',
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

  generateCSV() {
    this.afs
      .collection<User>('users')
      .valueChanges({ idfield: 'id' })
      .pipe(take(1), trace('firestore'))
      .subscribe((users) => {
        const csv = [];
        const headers = ['UID', 'Nome da conta Google', 'Nome', 'RA', 'Email', 'Data_locale', 'Data_iso'];
        csv.push(headers);
        this.attendanceCollection$.pipe(take(1)).subscribe((attendanceCol) => {
          attendanceCol.forEach((attendance) => {
            const user = users.find((user) => user.uid === attendance.id);
            const row = [
              user.uid,
              user.displayName,
              user.fullName,
              user.academicID,
              user.email,
              this.getDateFromTimestamp(attendance.time).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              this.getDateFromTimestamp(attendance.time).toISOString(),
            ];
            csv.push(row);
          });

          this.event$.pipe(take(1)).subscribe((event) => {
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
