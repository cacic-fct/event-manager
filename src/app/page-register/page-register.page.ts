import { Component, OnInit, ViewChild } from '@angular/core';

import { Router } from '@angular/router';

import { AuthService } from '../shared/services/auth.service';
import { AlertController } from '@ionic/angular';

import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';

import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { textHeights } from 'ol/render/canvas';
import { User } from '../shared/services/user';

import { GlobalConstantsService } from '../shared/services/global-constants.service';

import { trace } from '@angular/fire/compat/performance';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-page-register',
  templateUrl: './page-register.page.html',
  styleUrls: ['./page-register.page.scss'],
})
export class PageRegisterPage implements OnInit {
  @ViewChild('mySwal')
  private mySwal: SwalComponent;

  dataVersion: string = GlobalConstantsService.userDataVersion;
  userData: any;
  dataForm: FormGroup = new FormGroup({
    academicID: new FormControl(''),
    dob: new FormControl(''),
    phone: new FormControl(''),
  });

  constructor(
    public authService: AuthService,
    public alertController: AlertController,
    public formBuilder: FormBuilder,
    public afs: AngularFirestore,
    public router: Router
  ) {
    this.userData = JSON.parse(localStorage.getItem('user'));
  }

  ngOnInit() {
    this.afs
      .collection('users')
      .doc<User>(this.userData.uid)
      .collection('private')
      .doc('academic')
      .valueChanges()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((user) => {
        this.dataForm.value.academicID = user.academicID;
      });
    this.userData.uid.replace(/%20/g, ' ') +
      '%0D%0Anome%3A%20' +
      this.userData.displayName.replace(/%20/g, ' ') +
      '%0D%0Ae-mail%20institucional%3A%20' +
      this.userData.email.replace(/%20/g, ' ') +
      '%0D%0A';
    this.dataForm = this.formBuilder.group({
      // Validator doesn't update when value changes programatically
      // https://github.com/angular/angular/issues/30616
      academicID: ['' /*[Validators.required, Validators.pattern('^[0-9]{9}$')]*/],
    });
  }

  onSubmit() {
    if (!this.dataForm.valid) {
      return;
    }
    const userRef: AngularFirestoreDocument<any> = this.afs.collection('users').doc(this.userData.uid);
    const user = {
      dataVersion: this.dataVersion,
    };

    const userPrivateAcademic = {
      academicID: this.dataForm.value.academicID,
    };

    userRef.set(user, {
      merge: true,
    });

    userRef
      .collection('private')
      .doc('academic')
      .valueChanges()
      .subscribe((user) => {
        console.log(user);
      });

    userRef.collection('private').doc('academic').set(userPrivateAcademic, {
      merge: true,
    });

    this.mySwal.fire();
    // Fake delay to let animation finish
    setTimeout(() => {
      this.mySwal.close();
      this.router.navigate(['/menu']);
    }, 1500);
  }
}
