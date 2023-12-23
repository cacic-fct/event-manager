import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CertificateDocPublic } from 'src/app/shared/services/certificates.service';
import { decodeCertificateCode } from 'src/app/shared/services/certificates.service';

@Component({
  selector: 'app-validate-certificate',
  templateUrl: './validate-certificate.page.html',
  styleUrls: ['./validate-certificate.page.scss'],
})
export class ValidateCertificatePage implements OnInit {
  param: string;
  eventID: string;
  certificateID: string;
  certificateDoc: string;
  certificatePublic$: Observable<CertificateDocPublic | undefined>;

  constructor(private route: ActivatedRoute, private afs: AngularFirestore) {
    this.param = this.route.snapshot.paramMap.get('param') as string;

    const object = decodeCertificateCode(this.param);

    const eventID = object.eventID;
    const certificateID = object.certificateID;
    const certificateDoc = object.certificateDoc;

    this.eventID = eventID;
    this.certificateID = certificateID;
    this.certificateDoc = certificateDoc;
    this.certificatePublic$ = this.afs
      .doc<CertificateDocPublic>(`certificates/${this.eventID}/${this.certificateID}/${this.certificateDoc}`)
      .valueChanges({ idField: 'id' });
  }

  ngOnInit() {}
}
