import { CertificateStoreData } from 'src/app/shared/services/certificates.service';
import { MailtoService, Mailto } from 'src/app/shared/services/mailto.service';
import { Component, inject, OnInit } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { filterNullish } from 'src/app/shared/services/rxjs.service';

import { User } from '@firebase/auth';

import { map, Observable, take, switchMap } from 'rxjs';
import { UserCertificateDocument, CertificateService } from 'src/app/shared/services/certificates.service';
import { Auth, user } from '@angular/fire/auth';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';

@Component({
  selector: 'app-list-certificates',
  templateUrl: './list-certificates.component.html',
  styleUrls: ['./list-certificates.component.scss'],
})
export class ListCertificatesComponent implements OnInit {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private analytics: Analytics = inject(Analytics);
  user$ = user(this.auth);

  majorEventID!: string;
  userData: User;
  certificatesColletion$: Observable<UserCertificateDocumentLocal[]>;
  userID!: string;

  constructor(
    private modalController: ModalController,
    private mailtoService: MailtoService,
    private certificateService: CertificateService,
    private toastController: ToastController
  ) {
    this.userData = JSON.parse(localStorage.getItem('user') as string);

    this.certificatesColletion$ = this.user$.pipe(
      filterNullish(),
      map((user) => {
        this.userID = user.uid;
        const colRef = collection(
          this.firestore,
          `/users/${user.uid}/userCertificates/majorEvents/${this.majorEventID}`
        );
        const col$ = collectionData(colRef, { idField: 'id' }) as Observable<UserCertificateDocument[]>;

        return col$.pipe(
          take(1),
          map((certificates) =>
            certificates.map((certificate) => {
              const docRef = doc(
                this.firestore,
                `/majorEvents/${this.majorEventID}/majorEventCertificates/${certificate.id}`
              );
              const docData$ = docData(docRef, { idField: 'id' }) as Observable<CertificateStoreData>;

              return {
                ...certificate,
                certificateData: docData$.pipe(
                  take(1),
                  map((certificateData) => {
                    return {
                      ...(certificateData as CertificateStoreData),
                      id: certificateData.id,
                    };
                  })
                ),
              };
            })
          )
        );
      }),
      switchMap((value) => value)
    );
  }

  ngOnInit() {}

  closeModal() {
    this.modalController.dismiss();
  }

  mailtoReportError(): void {
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Problema com certificado',
      body: `Olá!\n\n\n\n\n=== Não apague os dados abaixo ===\nE-mail: ${this.userData.email}\nuid: ${this.userData.uid}\nmajorEventID: ${this.majorEventID}\n`,
    };
    this.mailtoService.open(mailto);
  }

  async getCertificate(event: any, certificateData: CertificateStoreData, certificate: UserCertificateDocumentLocal) {
    event.target.disabled = true;

    try {
      this.certificateService.generateCertificate(this.majorEventID, certificateData, certificate);
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(() => {
        event.target.disabled = false;
      }, 5000);
    }
  }

  async copyValidationUrl(certificateID: string) {
    const toast = await this.toastController.create({
      header: 'Compartilhar certificado',
      message: 'Link copiado para a área de transferência.',
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

    navigator.clipboard.writeText(`https://fct-pp.web.app/certificado/validar/${this.majorEventID}-${certificateID}`);
    toast.present();

    logEvent(this.analytics, 'share', {
      content_type: 'certificate',
      item_id: `${this.majorEventID}-${certificateID}`,
    });
  }
}

interface UserCertificateDocumentLocal extends UserCertificateDocument {
  certificateData: Observable<CertificateStoreData>;
}
