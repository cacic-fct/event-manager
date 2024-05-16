import { AsyncPipe } from '@angular/common';
import { CertificateStoreData } from 'src/app/shared/services/certificates.service';
import { MailtoService, Mailto } from 'src/app/shared/services/mailto.service';
import { Component, inject, OnInit } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { filterNullish } from 'src/app/shared/services/rxjs.service';

import { User } from '@firebase/auth';

import { map, Observable, take, switchMap } from 'rxjs';
import { UserCertificateDocument, CertificateService } from 'src/app/shared/services/certificates.service';
import { Auth, user } from '@angular/fire/auth';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonTitle,
  IonContent,
  IonSpinner,
  IonItem,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonProgressBar,
} from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';

import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-list-certificates',
  templateUrl: './list-certificates.component.html',
  styleUrls: ['./list-certificates.component.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonTitle,
    IonContent,
    IonSpinner,
    IonItem,
    IonIcon,
    IonGrid,
    IonRow,
    IonCol,
    IonProgressBar,
    AsyncPipe,
  ],
})
export class ListCertificatesComponent {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private analytics: Analytics = inject(Analytics);
  user$: Observable<User>;

  majorEventID: string;
  userData: User;
  certificatesColletion$: Observable<UserCertificateDocumentLocal[]>;

  constructor(
    private modalController: ModalController,
    private mailtoService: MailtoService,
    private certificateService: CertificateService,
    private toastController: ToastController,
    private route: ActivatedRoute,
  ) {
    this.user$ = user(this.auth);
    this.majorEventID = this.route.snapshot.paramMap.get('majorEventID') as string;
    this.userData = JSON.parse(localStorage.getItem('user') as string);

    this.certificatesColletion$ = this.user$.pipe(
      take(1),
      filterNullish(),
      map((user) => {
        const colRef = collection(
          this.firestore,
          `/users/${user.uid}/userCertificates/majorEvents/${this.majorEventID}`,
        );
        const col$ = collectionData(colRef, { idField: 'id' }) as Observable<UserCertificateDocument[]>;

        return col$.pipe(
          take(1),
          map((certificates) =>
            certificates.map((certificate) => {
              const docRef = doc(
                this.firestore,
                `/majorEvents/${this.majorEventID}/majorEventCertificates/${certificate.id}`,
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
                  }),
                ),
              };
            }),
          ),
        );
      }),
      switchMap((value) => value),
    );
  }

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

  async copyValidationUrl(certificateID: string, certificateDoc: string) {
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

    const encoded = this.certificateService.encodeCertificateCode(this.majorEventID, certificateID, certificateDoc);

    navigator.clipboard.writeText(`${environment.baseUrl}certificado/verificar/${encoded}`);
    toast.present();

    logEvent(this.analytics, 'share', {
      content_type: 'certificate',
      item_id: `${encoded}`,
    });
  }
}

interface UserCertificateDocumentLocal extends UserCertificateDocument {
  certificateData: Observable<CertificateStoreData>;
}
