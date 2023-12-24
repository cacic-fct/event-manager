import { CertificatePreviewModalComponent } from './components/certificate-preview-modal/certificate-preview-modal.component';
import { DateService } from 'src/app/shared/services/date.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonDatetimeButton, IonIcon, ModalController } from '@ionic/angular/standalone';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  participationTypes,
  eventTypes,
  contentTypes,
  certificateTemplates,
} from '../../../shared/services/certificates.service';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { Observable, take } from 'rxjs';
import { AuthService } from 'src/app/shared/services/auth.service';
import { Functions, httpsCallable, HttpsCallableResult } from '@angular/fire/functions';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonNote,
  IonInput,
  IonButton,
  IonTextarea,
  IonDatetime,
  IonModal,
} from '@ionic/angular/standalone';
import { AsyncPipe, KeyValuePipe } from '@angular/common';

@Component({
  selector: 'app-issue-certificate',
  templateUrl: './issue-certificate.page.html',
  styleUrls: ['./issue-certificate.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonNote,
    IonInput,
    IonButton,
    IonTextarea,
    IonDatetime,
    IonModal,
    IonIcon,
    IonDatetimeButton,
    SweetAlert2Module,
    KeyValuePipe,
    ReactiveFormsModule,
    AsyncPipe,
  ],
})
export class IssueCertificatePage implements OnInit {
  private functions: Functions = inject(Functions);
  public participationTypes = participationTypes;
  public eventTypes = eventTypes;
  public contentTypes = contentTypes;
  public certificateTemplates = certificateTemplates;

  @ViewChild('swalNotFound')
  public readonly swalNotFound!: SwalComponent;

  eventID: string | null;
  event$: Observable<MajorEventItem>;

  dataForm: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private alertController: AlertController,
    private route: ActivatedRoute,
    private router: Router,
    private afs: AngularFirestore,
    private dateService: DateService,
    private modalController: ModalController,
    private authService: AuthService
  ) {
    this.eventID = this.route.snapshot.paramMap.get('eventID');

    if (this.eventID === null) {
      this.swalNotFound.fire();
      this.router.navigate(['/area-restrita/gerenciar-grandes-eventos']);
    }

    this.dataForm = this.formBuilder.group({
      issueType: ['', Validators.required],
      issueList: this.formBuilder.array([]),
      batchIssue: this.formBuilder.group(
        {
          toPayer: [true],
          toNonSubscriber: [false],
          toNonPayer: [false],
        },
        {
          validators: [this.batchIssueValidator],
        }
      ),
      certificateName: ['', Validators.required],
      certificateID: ['', Validators.required],
      certificateTemplate: ['', Validators.required],
      issueDate: [
        this.dateService.getISOStringToIonDatetime(this.dateService.getDateNowWithTimezoneOffset()),
        Validators.required,
      ],

      extraText: [''],

      participationType: this.formBuilder.group(
        {
          type: ['', Validators.required],
          custom: [''],
        },
        {
          validators: [this.customGroupValidator],
        }
      ),

      eventType: this.formBuilder.group(
        {
          type: ['', Validators.required],
          custom: [''],
        },
        {
          validators: [this.customGroupValidator],
        }
      ),

      contentType: this.formBuilder.group(
        {
          type: ['', Validators.required],
          custom: [''],
        },
        {
          validators: [this.customGroupValidator],
        }
      ),
    });

    this.event$ = this.afs.collection('majorEvents').doc(this.eventID!).valueChanges() as Observable<MajorEventItem>;
  }

  customGroupValidator(control: AbstractControl): ValidationErrors | null {
    const eventType = control.get('type')?.value;
    const custom = control.get('custom')?.value;

    if (eventType === 'custom' && custom === '') {
      return { customRequired: true };
    }
    return null;
  }

  batchIssueValidator(control: AbstractControl): ValidationErrors | null {
    // Only validate if issueType is batch
    const issueType = control.parent?.get('issueType')?.value;

    if (issueType !== 'batch') {
      return null;
    }

    const toPayer = control.get('toPayer')?.value;
    const toNonSubscriber = control.get('toNonSubscriber')?.value;
    const toNonPayer = control.get('toNonPayer')?.value;

    // At least one option must be selected
    if (!toPayer && !toNonSubscriber && !toNonPayer) {
      return { atLeastOneOption: true };
    }

    return null;
  }

  ngOnInit() {
    this.event$.pipe(take(1)).subscribe((event) => {
      if (event === undefined) {
        this.swalNotFound.fire();

        setTimeout(() => {
          this.router.navigate(['/area-restrita/gerenciar-grandes-eventos']);
          this.swalNotFound.close();
        }, 1000);
      }
    });
  }

  // autofill() {
  //   this.dataForm.patchValue({
  //     certificateName: 'Certificado de Participação',
  //     certificateID: 'participacao',
  //     certificateTemplate: 'cacic',
  //     issueType: 'list',
  //     issueList: [{ userData: 'Usuário 0' }],
  //     participationType: { type: 'participacao' },
  //     eventType: { type: 'palestra' },
  //     contentType: { type: 'default' },
  //   });

  //   const issueList = this.dataForm.get('issueList') as FormArray;
  //   // repeat 3 times
  //   for (let i = 1; i <= 3; i++) {
  //     issueList.push(
  //       this.formBuilder.group({
  //         userData: [`Usuário ${i}`, Validators.required],
  //       })
  //     );
  //   }
  // }
  async prepareUserUids(userDataList: string[]): Promise<boolean> {
    const userUidList: string[] = [];

    const notFoundList: number[] = [];

    for (let i = 0; i < userDataList.length; i++) {
      await this.authService.getUserUid(userDataList[i]).then((response) => {
        const uid = response.data;
        if (uid) {
          userUidList.push(uid);
        } else {
          notFoundList.push(i);
        }
      });
    }

    if (notFoundList.length > 0) {
      // Set error FormGroup that are on notFoundList
      const issueList = this.dataForm.get('issueList') as FormArray;
      notFoundList.forEach((index) => {
        issueList.controls[index].setErrors({ notFound: true });
      });
      return false;
    }

    return true;
  }

  onSubmit() {
    if (this.dataForm.invalid) {
      return;
    }

    const issueList = this.dataForm.get('issueList')?.value;
    const userDataList: string[] = issueList.map((item: { userData: string }) => item.userData);

    this.prepareUserUids(userDataList).then(async (response) => {
      if (!response) {
        // Alert user that some users were not found
        const alert = await this.alertController.create({
          header: 'Alguns usuários não foram encontrados',
          message: 'Verifique a lista e tente novamente.',
          buttons: ['OK'],
        });

        await alert.present();

        return;
      }

      const certificateData = {
        certificateName: this.dataForm.get('certificateName')?.value,
        certificateID: this.dataForm.get('certificateID')?.value,
        certificateTemplate: this.dataForm.get('certificateTemplate')?.value,
        issueDate: this.dateService.TimestampFromDate(this.dateService.parseISO(this.dataForm.get('issueDate')?.value)),
        extraText: this.dataForm.get('extraText')?.value || null,
        participation: {
          type: this.dataForm.get('participationType')?.get('type')?.value,
          custom: this.dataForm.get('participationType')?.get('custom')?.value || null,
        },
        event: {
          type: this.dataForm.get('eventType')?.get('type')?.value,
          custom: this.dataForm.get('eventType')?.get('custom')?.value || null,
        },
        content: {
          type: this.dataForm.get('contentType')?.get('type')?.value,
          custom: this.dataForm.get('contentType')?.get('custom')?.value || null,
        },
        issuedTo: {
          toPayer: this.dataForm.get('batchIssue')?.get('toPayer')?.value,
          toNonSubscriber: this.dataForm.get('batchIssue')?.get('toNonSubscriber')?.value,
          toNonPayer: this.dataForm.get('batchIssue')?.get('toNonPayer')?.value,
          toList: userDataList,
        },
      };

      this.openConfirmModal(certificateData).then((result) => {
        if (!result) {
          return;
        }

        const payload = {
          certificateData: certificateData,
          issuer: 'eu',
          majorEventID: this.eventID,
        };

        const issueData = httpsCallable(this.functions, 'certificates-issueMajorEventCertificate');
        issueData(payload).then((response: HttpsCallableResult<any>) => {
          const responseData: { success: boolean; data: string; message: string } = response.data;

          if (responseData.success) {
            console.log(response);
            const alert = this.alertController.create({
              header: 'Certificados emitidos com sucesso',
              buttons: ['OK'],
            });

            alert.then((alert) => {
              alert.present();
            });
          } else {
            console.error(response);
            const alert = this.alertController.create({
              header: 'Erro ao emitir certificados',
              message: 'Confira o log para mais informações: ' + response.data.error,
              buttons: ['OK'],
            });

            alert.then((alert) => {
              alert.present();
            });
          }
        });
      });
    });
    return;
  }

  async openConfirmModal(certificateData: { [key: string]: any }): Promise<boolean> {
    const modal = await this.modalController.create({
      component: CertificatePreviewModalComponent,
      componentProps: {
        certificateData: certificateData,
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

  addToIssueList() {
    const issueList = this.dataForm.get('issueList') as FormArray;
    issueList.push(
      this.formBuilder.group({
        userData: ['', Validators.required],
      })
    );
  }

  issueToggleChange() {
    if (this.dataForm.get('issueType')?.value === 'list') {
      if (this.getIssueList().length === 0) {
        this.addToIssueList();
      }
    }
  }

  removeIssueList(i: number) {
    if (this.getIssueList().length === 1) {
      return;
    }
    const issueList = this.dataForm.get('issueList') as FormArray;
    issueList.removeAt(i);
  }

  getIssueList() {
    return (this.dataForm.get('issueList') as FormArray).controls;
  }

  clearIssueList() {
    const issueList = this.dataForm.get('issueList') as FormArray;
    issueList.clear();
    this.addToIssueList();
  }

  async clearIssueListAlert() {
    const alert = await this.alertController.create({
      header: 'Limpar lista',
      message: 'Tem certeza que deseja limpar a lista de usuários?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Limpar',
          handler: () => {
            this.clearIssueList();
          },
        },
      ],
    });

    await alert.present();
  }

  formatCertificateName() {
    const certificateName = this.dataForm.get('certificateName')?.value;
    let formatName = certificateName
      // Remove trailing spaces
      .trim()
      // Remove multiple spaces in a row
      .replace(/\s+/g, ' ');

    // Capitalize first letter
    formatName = formatName.charAt(0).toUpperCase() + formatName.slice(1);

    this.dataForm.get('certificateName')?.setValue(formatName);
  }

  formatCertificateID() {
    // Get string and format it to be used as a Firestore collection ID
    // Example: "Certificado de Participação" -> "certificado-de-participacao"

    const certificateName = this.dataForm.get('certificateName')?.value;
    const certificateID = certificateName
      // Remove accents ção -> cao
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove special characters
      .replace(/[^a-zA-Z0-9 ]/g, '')
      // Replace spaces with dashes
      .replace(/\s/g, '-')
      // Remove multiple dashes in a row '---' -> '-'
      .replace(/-+/g, '-')
      // Remove trailing dash
      .replace(/-$/, '')
      .toLowerCase();

    this.dataForm.get('certificateID')?.setValue(certificateID);
  }
}
