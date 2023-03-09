// @ts-strict-ignore
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { ModalController } from '@ionic/angular';
import { Component, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { format, parseISO, addHours } from 'date-fns';
import { Timestamp } from '@firebase/firestore';

import { BehaviorSubject, Observable } from 'rxjs';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

import { ConfirmModalComponent } from './components/confirm-modal/confirm-modal.component';
import { serverTimestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-add-major-event',
  templateUrl: './add-major-event.page.html',
  styleUrls: ['./add-major-event.page.scss'],
})
export class AddMajorEventPage implements OnInit {
  @ViewChild('successSwal') private successSwal: SwalComponent;
  @ViewChild('errorSwal') private errorSwal: SwalComponent;

  courses = CoursesService.courses;
  priceDifferentiate: boolean = true;
  _priceDifferentiateSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(this.priceDifferentiate);
  priceDifferentiate$: Observable<boolean> = this._priceDifferentiateSubject.asObservable();
  isEventPaid: boolean = true;
  _isEventPaidSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(this.isEventPaid);
  isEventPaid$: Observable<boolean> = this._isEventPaidSubject.asObservable();

  dataForm: FormGroup;

  userData: any;
  constructor(
    public formBuilder: FormBuilder,
    private modalController: ModalController,
    private afs: AngularFirestore,
    private router: Router,
    private auth: AngularFireAuth
  ) {
    this.userData = JSON.parse(localStorage.getItem('user'));
  }

  ngOnInit() {
    const tzoffset: number = new Date().getTimezoneOffset() * 60000;
    const dateISO: string = new Date(Date.now() - tzoffset).toISOString().slice(0, -1);
    const dateISOHourOffset: string = addHours(new Date(Date.now() - tzoffset), 1)
      .toISOString()
      .slice(0, -1);

    this.dataForm = this.formBuilder.group(
      {
        course: ['', Validators.required],
        name: ['', Validators.required],
        description: '',
        eventStartDate: [dateISO, Validators.required],
        eventEndDate: [dateISOHourOffset],
        subscriptionStartDate: [dateISO, Validators.required],
        subscriptionEndDate: [dateISOHourOffset, Validators.required],
        maxCourses: '',
        maxLectures: '',
        isEventPaidForm: this.isEventPaid,
        priceSingle: '',
        priceStudents: '',
        priceOtherStudents: '',
        priceProfessors: '',
        chavePix: '',
        bankName: '',
        accountName: '',
        document: ['', this.validateCPFOrCNPJ],
        agency: '',
        accountNumber: '',
        additionalPaymentInformation: '',
        public: true,
        buttonText: '',
        buttonUrl: '',
      },
      {
        validators: [this.validatorButton, this.requirePaymentDetails, this.validatorDateEnd],
      }
    );
    this.userData.displayName.replace(/%20/g, ' ');
  }

  formatDate(value: string) {
    return format(parseISO(value), 'dd/MM/yyyy HH:mm');
  }

  onSubmit() {
    if (!this.dataForm.valid) {
      return false;
    }

    this.openConfirmModal().then((response) => {
      if (!response) {
        return;
      }
      let price: MajorEventItem['price'];

      if (this.isEventPaid) {
        if (this.priceDifferentiate) {
          price = {
            students: Number.parseFloat(this.dataForm.get('priceStudents').value) || 0,
            otherStudents: Number.parseFloat(this.dataForm.get('priceOtherStudents').value) || 0,
            professors: Number.parseFloat(this.dataForm.get('priceProfessors').value) || 0,
          };
        } else {
          price = {
            single: Number.parseFloat(this.dataForm.get('priceSingle').value) || 0,
          };
        }
      } else {
        price = { isFree: true };
      }

      let buttonUrl = this.dataForm.get('buttonUrl').value;

      if (buttonUrl) {
        const pattern = /^((http|https):\/\/)/;
        if (!pattern.test(buttonUrl)) {
          this.dataForm.setValue({ ...this.dataForm.value, buttonUrl: 'https://' + buttonUrl });
        }
      }

      this.auth.user.subscribe((user) => {
        this.afs
          .collection<MajorEventItem>('majorEvents')
          .add({
            name: this.dataForm.get('name').value,
            course: this.dataForm.get('course').value,
            description: this.dataForm.get('description').value,
            eventStartDate: Timestamp.fromDate(new Date(this.dataForm.get('eventStartDate').value)),
            eventEndDate: Timestamp.fromDate(new Date(this.dataForm.get('eventEndDate').value)),
            subscriptionStartDate: Timestamp.fromDate(new Date(this.dataForm.get('subscriptionStartDate').value)),
            subscriptionEndDate: Timestamp.fromDate(new Date(this.dataForm.get('subscriptionEndDate').value)),
            maxCourses: Number.parseInt(this.dataForm.get('maxCourses').value) || null,
            maxLectures: Number.parseInt(this.dataForm.get('maxLectures').value) || null,
            price: price,
            paymentInfo: this.isEventPaid
              ? {
                  chavePix: this.dataForm.get('chavePix').value,
                  bankName: this.dataForm.get('bankName').value,
                  name: this.dataForm.get('accountName').value,
                  document: this.dataForm.get('document').value,
                  agency: this.dataForm.get('agency').value,
                  accountNumber: this.dataForm.get('accountNumber').value,
                  additionalPaymentInformation: this.dataForm.get('additionalPaymentInformation').value,
                }
              : null,
            button: this.dataForm.get('buttonUrl').value
              ? {
                  text: this.dataForm.get('buttonText').value,
                  url: this.dataForm.get('buttonUrl').value,
                }
              : null,
            public: this.dataForm.get('public').value === '' || false,
            createdBy: user.uid,
            // @ts-ignore
            createdOn: serverTimestamp(),
            events: [],
          })
          .then(() => {
            this.successSwal.fire();
            // Fake delay to let animation finish
            setTimeout(() => {
              this.successSwal.close();
              this.router.navigate(['/area-restrita'], { replaceUrl: true });
            }, 1500);
          })
          .catch((err) => {
            this.errorSwal.fire();
            console.error('Failed to write majorEvent to Firestore', err);
          });
      });
    });
  }

  validatorButton(control: AbstractControl): ValidationErrors | null {
    if (control.get('buttonText').value != '') {
      control.get('buttonUrl').addValidators(Validators.required);
    } else {
      control.get('buttonUrl').removeValidators(Validators.required);
    }
    control.get('buttonUrl').updateValueAndValidity({ onlySelf: true });

    return null;
  }

  requirePaymentDetails(control: AbstractControl): ValidationErrors | null {
    // Entradas que se tornam obrigatórias caso o evento seja pago
    const affectedForms = [
      control.get('bankName'),
      control.get('accountName'),
      control.get('document'),
      control.get('agency'),
      control.get('accountNumber'),
    ];

    if (
      control.get('isEventPaidForm').value === true &&
      (control.get('chavePix').value != '' || control.get('accountNumber').value != '')
    ) {
      affectedForms.forEach((form) => form.addValidators(Validators.required));
    } else {
      affectedForms.forEach((form) => form.removeValidators(Validators.required));
    }
    affectedForms.forEach((form) => form.updateValueAndValidity({ onlySelf: true }));

    return null;
  }

  priceDifferentiateChange() {
    this.priceDifferentiate = !this.priceDifferentiate;
    this._priceDifferentiateSubject.next(this.priceDifferentiate);
  }

  isEventPaidChange() {
    this.isEventPaid = !this.isEventPaid;
    this._isEventPaidSubject.next(this.isEventPaid);
    this.dataForm.controls['document'].updateValueAndValidity();
  }

  inputNumbersOnly(event) {
    const pattern = /\d/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) {
      // Not a number, prevent input
      event.preventDefault();
    }
  }

  inputBankAccountNumber(event) {
    const pattern = /\d|-|x|X/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) {
      // Not a number, dash or x, prevent input
      event.preventDefault();
    }
  }

  async openConfirmModal(): Promise<boolean> {
    const modal = await this.modalController.create({
      component: ConfirmModalComponent,
      componentProps: {
        dataForm: this.dataForm,
        isEventPaid: this.isEventPaid,
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

  inputCurrency(event) {
    if ((event.key < '0' || event.key > '9') && event.key !== '.' && event.key !== ',') {
      event.preventDefault();
    }
  }

  validateCPFOrCNPJ = (control: AbstractControl): ValidationErrors | null => {
    if (this.isEventPaid === true) {
      const cpfOrCnpj: string = control.value;

      if (cpfOrCnpj.length < 11) {
        return { document: false };
      }

      if (cpfOrCnpj.length === 11) {
        // If CPF is 000.000.000-00, 111.111.111-11, etc, return false
        if (/^(.)\1*$/.test(cpfOrCnpj)) {
          return { document: false };
        }
        let soma = 0;
        let peso = 10;
        let resto = 0;

        for (let i = 0; i < cpfOrCnpj.length - 2; i++) {
          soma += Number.parseInt(control.value[i]) * peso;
          peso--;
        }
        resto = soma % 11;

        let dv1 = 11 - resto;
        if (dv1 > 9) dv1 = 0;

        soma = 0;
        peso = 11;
        for (let i = 0; i < cpfOrCnpj.length - 2; i++) {
          soma += Number.parseInt(cpfOrCnpj[i]) * peso;
          peso--;
        }
        soma += dv1 * peso;

        resto = soma % 11;

        let dv2 = 11 - resto;
        if (dv2 > 9) dv2 = 0;

        if (
          Number.parseInt(cpfOrCnpj[cpfOrCnpj.length - 2]) !== dv1 ||
          Number.parseInt(cpfOrCnpj[cpfOrCnpj.length - 1]) !== dv2
        )
          return { document: false };
      } else if (cpfOrCnpj.length === 14) {
        let soma = 0;
        let resto = 0;
        let dv1 = 0;
        let dv2 = 0;
        let peso = 0;

        peso = 5;
        for (let i = 0; i < cpfOrCnpj.length - 2; i++) {
          soma += Number.parseInt(cpfOrCnpj[i]) * peso;
          peso--;

          if (peso === 1) peso = 9;
        }

        resto = soma % 11;
        dv1 = 11 - resto;
        if (dv1 > 9) dv1 = 0;

        soma = 0;
        resto = 0;
        peso = 6;
        for (let i = 0; i < cpfOrCnpj.length - 1; i++) {
          soma += Number.parseInt(cpfOrCnpj[i]) * peso;
          peso--;

          if (peso === 1) peso = 9;
        }

        resto = soma % 11;
        dv2 = 11 - resto;

        if (dv2 > 9) dv2 = 0;

        if (
          Number.parseInt(cpfOrCnpj[cpfOrCnpj.length - 2]) !== dv1 ||
          Number.parseInt(cpfOrCnpj[cpfOrCnpj.length - 1]) !== dv2
        )
          return { document: false };
      }
    }
    return null;
  };

  validatePrice(event, key) {
    const cleanMoney = event.target.value
      // Remove anything that isn't valid in a number
      .replace(/[^\d.,]/g, '')
      // Replace all commas with periods
      .replace(/,/g, '.')
      // Remove all periods unless it is the last one
      .replace(/\.(?=.*\.)/g, '');
    this.dataForm.get(key).setValue(cleanMoney);
  }

  validateAccountNumber(event) {
    const cleanAccount = event.target.value
      // Remove anything that isn't valid in a number or dash
      .replace(/[^\d-xX]/g, '')
      // Remove all dashes unless it is the last one
      .replace(/-(?=.*-)/g, '');
    this.dataForm.get('accountNumber').setValue(cleanAccount);
  }

  validatorDateEnd(control: AbstractControl): ValidationErrors | null {
    const eventStartDate = parseISO(control.get('eventStartDate').value);
    const eventEndDate = parseISO(control.get('eventEndDate').value);
    const subscriptionStartDate = parseISO(control.get('subscriptionStartDate').value);
    const subscriptionEndDate = parseISO(control.get('subscriptionEndDate').value);
    if (eventStartDate > eventEndDate || subscriptionStartDate > subscriptionEndDate) {
      return { dateRange: true };
    }

    return null;
  }
}
