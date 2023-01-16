import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CertificateDocPublic } from 'src/app/shared/services/certificates.service';
import { id } from 'date-fns/locale';

@Component({
  selector: 'app-validate-certificate',
  templateUrl: './validate-certificate.page.html',
  styleUrls: ['./validate-certificate.page.scss'],
})
export class ValidateCertificatePage implements OnInit {
  param: string;
  eventID: string;
  certificateID: string;
  certificatePublic$: Observable<CertificateDocPublic | undefined>;

  constructor(private route: ActivatedRoute, private afs: AngularFirestore) {
    this.param = this.route.snapshot.paramMap.get('param') as string;

    const [eventID, certificateID] = this.param.split('-');
    this.eventID = eventID;
    this.certificateID = certificateID;

    console.log('param', this.param, 'eventID', this.eventID, 'certificateID', this.certificateID);
    this.certificatePublic$ = this.afs
      .doc<CertificateDocPublic>(`certificates/${this.eventID}/${this.certificateID}/public`)
      .valueChanges({ idField: 'id' });
  }

  ngOnInit() {}
}
