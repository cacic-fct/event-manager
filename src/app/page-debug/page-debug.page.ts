import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Component, OnInit } from '@angular/core';
import firebase from 'firebase/compat/app';

@Component({
  selector: 'app-page-debug',
  templateUrl: './page-debug.page.html',
  styleUrls: ['./page-debug.page.scss'],
})
export class PageDebugPage implements OnInit {
  constructor(public afa: AngularFireAuth) {}

  ngOnInit() {}

  unlinkPhone() {
    firebase.auth().currentUser.unlink(firebase.auth.PhoneAuthProvider.PROVIDER_ID);
  }
}
