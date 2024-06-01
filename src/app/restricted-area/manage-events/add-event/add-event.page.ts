// @ts-strict-ignore
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventItem, MajorEventsService } from 'src/app/shared/services/major-event.service';
import { format, getDayOfYear, isEqual, parseISO, setDayOfYear, subMilliseconds } from 'date-fns';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { take, Observable, map } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { ConfirmAddEventModalPage } from './confirm-add-event-modal/confirm-add-event-modal.page';
import { getStringChanges, RemoteConfig } from '@angular/fire/remote-config';
import { serverTimestamp, Timestamp, arrayUnion } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import {
  IonSelect,
  ModalController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCardHeader,
  IonItem,
  IonLabel,
  IonSelectOption,
  IonToggle,
  IonCardTitle,
  IonInput,
  IonDatetimeButton,
  IonTextarea,
  IonDatetime,
  IonModal,
  IonButton,
} from '@ionic/angular/standalone';
import { AsyncPipe, KeyValuePipe } from '@angular/common';

@Component({
  selector: 'app-add-event',
  templateUrl: './add-event.page.html',
  styleUrls: ['./add-event.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCardHeader,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonCardTitle,
    IonInput,
    IonDatetimeButton,
    IonTextarea,
    IonDatetime,
    IonModal,
    IonButton,
    SweetAlert2Module,
    AsyncPipe,
    KeyValuePipe,
    ReactiveFormsModule,
  ],
})
export class AddEventPage implements OnInit {
  @ViewChild('successSwal') private successSwal: SwalComponent;
  @ViewChild('errorSwal') private errorSwal: SwalComponent;
  @ViewChild('errorMajorEventSwal') private errorMajorEventSwal: SwalComponent;
  @ViewChild('selectPlace', { static: false }) selectPlace: IonSelect;

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  courses = CoursesService.courses;
  majorEventsData$: Observable<MajorEventItem[]>;

  hasDateEnd = false;

  dataForm: FormGroup;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: any;

  places$: Observable<placesRemoteConfig>;

  tzoffset = new Date().getTimezoneOffset() * 60_000;
  parsedPlaces: placesRemoteConfig;

  private remoteConfig: RemoteConfig = inject(RemoteConfig);

  constructor(
    public formBuilder: FormBuilder,
    private modalController: ModalController,
    public majorEvents: MajorEventsService,
    private afs: AngularFirestore,
    private router: Router
  ) {
    this.userData = JSON.parse(localStorage.getItem('user'));
  }

  ngOnInit() {
    const dateISO: string = new Date(Date.now() - this.tzoffset).toISOString().slice(0, -1);
    const dateISOHourOffset: string = new Date(Date.now() - this.tzoffset).toISOString().slice(0, -1);
    this.dataForm = this.formBuilder.group(
      {
        course: ['', Validators.required],
        icon: ['', [Validators.required, Validators.pattern(/^\p{Emoji}|\p{Emoji_Modifier}$/u)]], // TODO: validar apenas 1 emoji
        name: ['', Validators.required],
        shortDescription: ['', Validators.maxLength(80)],
        description: '',
        eventStartDate: [dateISO, Validators.required],
        eventEndDate: dateISOHourOffset,
        location: this.formBuilder.group({
          description: '',
          lat: [
            '',
            [
              //Validators.pattern('^(+|-)?(?:90(?:(?:.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:.[0-9]{1,6})?))$')
            ],
          ],
          lon: [
            '',
            [
              //Validators.pattern('^(+|-)?(?:180(?:(?:.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:.[0-9]{1,6})?))$')
            ],
          ],
        }),
        youtubeCode: '',
        public: true,
        button: this.formBuilder.group({
          text: '',
          url: '',
        }),
        inMajorEvent: ['none', Validators.required],
        eventType: ['none', Validators.required],
        hasDateEndForm: this.hasDateEnd,
        issueCertificate: false,
        creditHours: ['', Validators.pattern(/^\d*$/)],
        slotsAvailable: '',
        collectAttendance: false,
        allowSubscription: false,
      },
      {
        validators: [this.validatorLatLong, this.validatorButton, this.validatorDateEnd],
      }
    );
    this.userData.displayName.replace(/%20/g, ' ');
    this.majorEventsData$ = this.majorEvents.getCurrentAndFutureMajorEvents();

    this.places$ = getStringChanges(this.remoteConfig, 'placesMap').pipe(
      map((places: string) => {
        if (places) {
          const parsed: placesRemoteConfig = JSON.parse(places);
          this.parsedPlaces = parsed;
          return parsed;
        }
        return {};
      })
    );
  }

  formatDate(value: string) {
    return format(parseISO(value), 'dd/MM/yyyy HH:mm');
  }

  onSubmit() {
    if (this.dataForm.invalid) {
      return;
    }
    this.openConfirmModal().then((response) => {
      if (response) {
        this.user$.pipe(take(1)).subscribe((user) => {
          let majorEvent = this.dataForm.get('inMajorEvent').value;
          if (majorEvent === 'none') {
            majorEvent = null;
          }

          let dateEnd: Timestamp | null;

          if (this.hasDateEnd) {
            dateEnd = Timestamp.fromDate(new Date(this.dataForm.get('eventEndDate').value));
          } else {
            dateEnd = null;
          }

          const buttonUrl: string = this.dataForm.get('button').get('url').value;

          if (buttonUrl) {
            const pattern = /^((http|https):\/\/)/;
            if (!pattern.test(buttonUrl)) {
              this.dataForm
                .get('button')
                .get('url')
                .setValue('https://' + buttonUrl);
            }
          }

          let location: { description: string; lat: number; lon: number } | null;

          if (
            !this.dataForm.get('location.description').value &&
            !this.dataForm.get('location.lat').value &&
            !this.dataForm.get('location.lon').value
          ) {
            location = null;
          } else {
            location = {
              description: this.dataForm.get('location.description').value,
              lat: Number.parseInt(this.dataForm.get('location.lat').value) || null,
              lon: Number.parseInt(this.dataForm.get('location.lon').value) || null,
            };
          }

          this.afs
            .collection<EventItem>('events')
            .add({
              course: this.dataForm.get('course').value,
              icon: this.dataForm.get('icon').value,
              name: this.dataForm.get('name').value,
              shortDescription: this.dataForm.get('shortDescription').value,
              description: this.dataForm.get('description').value,
              eventStartDate: Timestamp.fromDate(new Date(this.dataForm.get('eventStartDate').value)),
              eventEndDate: dateEnd,
              location: location,
              youtubeCode: this.dataForm.get('youtubeCode').value || null,
              public: this.dataForm.get('public').value,
              button: this.dataForm.get('button').get('url').value
                ? {
                    text: this.dataForm.get('button').get('text').value,
                    url: this.dataForm.get('button').get('url').value,
                  }
                : null,
              inMajorEvent: majorEvent,
              eventType: this.dataForm.get('eventType').value,
              issueCertificate: this.dataForm.get('issueCertificate').value,
              collectAttendance: this.dataForm.get('collectAttendance').value,
              creditHours: Number.parseInt(this.dataForm.get('creditHours').value) || null,
              createdBy: user.uid,
              // @ts-expect-error - This works
              createdOn: serverTimestamp(),
              slotsAvailable: Number.parseInt(this.dataForm.get('slotsAvailable').value) || 0,
              numberOfSubscriptions: 0,
              allowSubscription: this.dataForm.get('allowSubscription').value,
            })
            .then((res) => {
              if (majorEvent) {
                const eventId = res.id;
                this.afs
                  .collection('majorEvents')
                  .doc(majorEvent)
                  .update({ events: arrayUnion(eventId) })
                  .then(() => {
                    this.addEventSuccess();
                  })
                  .catch((err) => {
                    this.errorMajorEventSwal.fire();
                    console.error('Failed to add event ID in majorEvent array', err);
                  });
              } else {
                this.addEventSuccess();
              }
            })
            .catch((err) => {
              this.errorSwal.fire();
              console.error('Failed to write event to Firestore', err);
            });
        });
      }

      return;
    });
    return;
  }

  addEventSuccess(): void {
    this.successSwal.fire();
    // Fake delay to let animation finish
    setTimeout(() => {
      this.successSwal.close();
      this.router.navigate(['/area-restrita'], { replaceUrl: true });
    }, 1500);
  }

  async openConfirmModal(): Promise<boolean> {
    const modal = await this.modalController.create({
      component: ConfirmAddEventModalPage,
      componentProps: {
        dataForm: this.dataForm,
        hasDateEnd: this.hasDateEnd,
      },
      showBackdrop: true,
    });
    await modal.present();

    return modal.onDidDismiss().then((data) => {
      if (data.data) {
        return new Promise<boolean>((resolve) => {
          resolve(true);
        });
      }
      return new Promise<boolean>((resolve) => {
        resolve(false);
      });
    });
  }

  validatorLatLong(control: AbstractControl): ValidationErrors | null {
    if (control.get('location').get('lat').value == '' && control.get('location').get('lon').value == '') {
      control.get('location').get('lat').removeValidators(Validators.required);
      control.get('location').get('lon').removeValidators(Validators.required);
      control.get('location').get('lat').updateValueAndValidity({ onlySelf: true });
      control.get('location').get('lon').updateValueAndValidity({ onlySelf: true });
    }

    if (control.get('location').get('lon').value != '') {
      control.get('location').get('lat').addValidators(Validators.required);
      control.get('location').get('lat').updateValueAndValidity({ onlySelf: true });
    }

    if (control.get('location').get('lat').value != '') {
      control.get('location').get('lon').addValidators(Validators.required);
      control.get('location').get('lon').updateValueAndValidity({ onlySelf: true });
    }

    return null;
  }

  validatorDateEnd(control: AbstractControl): Record<string, boolean> | null {
    if (control.get('hasDateEndForm').value) {
      const dateStart = parseISO(control.get('eventStartDate').value);
      const dateEnd = parseISO(control.get('eventEndDate').value);

      if (dateEnd < dateStart || isEqual(dateStart, dateEnd)) return { dateRange: true };
    }

    return null;
  }

  validatorButton(control: AbstractControl): ValidationErrors | null {
    if (control.get('button').get('text').value != '')
      control.get('button').get('url').addValidators(Validators.required);
    else control.get('button').get('url').removeValidators(Validators.required);

    control.get('button').get('url').updateValueAndValidity({ onlySelf: true });
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  placeChange(ev: any) {
    if (this.parsedPlaces[ev.detail.value] === undefined) {
      return 1;
    }

    this.dataForm
      .get('location')
      .get('description')
      .setValue(
        this.parsedPlaces[ev.detail.value].name +
          (this.parsedPlaces[ev.detail.value].description ? ' - ' + this.parsedPlaces[ev.detail.value].description : '')
      );
    this.dataForm.get('location').get('lat').setValue(this.parsedPlaces[ev.detail.value].lat);
    this.dataForm.get('location').get('lon').setValue(this.parsedPlaces[ev.detail.value].lon);
    return 0;
  }

  placeInputKeyDown() {
    this.selectPlace.value = undefined;
  }

  hasDateEndChange() {
    this.hasDateEnd = !this.hasDateEnd;
  }

  onDateStartChange() {
    const newTime = setDayOfYear(
      parseISO(this.dataForm.get('eventEndDate').value),
      getDayOfYear(parseISO(this.dataForm.get('eventStartDate').value))
    );
    this.dataForm.get('eventEndDate').setValue(subMilliseconds(newTime, this.tzoffset).toISOString().slice(0, -1));
  }
}

type placesRemoteConfig = Record<
  string,
  {
    name: string;
    description: string;
    lat: string;
    lon: string;
  }
>;
