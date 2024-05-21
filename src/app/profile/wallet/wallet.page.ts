import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit } from '@angular/core';
import { Auth, user, getIdTokenResult } from '@angular/fire/auth';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { take, Observable, BehaviorSubject } from 'rxjs';
import { User } from 'src/app/shared/services/user';
import { trace } from '@angular/fire/compat/performance';
import { AsyncPipe } from '@angular/common';

import { azteccode, interleaved2of5, drawingSVG } from 'bwip-js';

import { SafePipe } from 'src/app/shared/pipes/safe.pipe';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonContent,
  IonCard,
  IonAvatar,
  IonCardTitle,
  IonSkeletonText,
  IonButton,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

import { ServiceWorkerService } from 'src/app/shared/services/service-worker/service-worker.service';

// import { register as registerSwiper } from 'swiper/element/bundle';
// import { SwiperOptions } from 'swiper/types';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    SafePipe,
    IonRouterLink,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonContent,
    IonCard,
    IonAvatar,
    IonCardTitle,
    IonSkeletonText,
    IonButton,
    AsyncPipe,
  ],
})
export class WalletPage implements OnInit {
  public profileBarcode: string;
  public restaurantBarcode: string;

  private auth: Auth = inject(Auth);

  user$ = user(this.auth);
  userFirestore$: Observable<User>;
  academicID$: Observable<string>;
  public serviceWorkerActive: boolean = false;
  _isProfessor = new BehaviorSubject<boolean>(false);
  isProfessor$: Observable<boolean> = this._isProfessor.asObservable();

  constructor(
    public courses: CoursesService,
    private afs: AngularFirestore,
    private sw: ServiceWorkerService,
  ) {
    this.serviceWorkerActive = this.sw.getServiceWorkerStatus();

    this.user$.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        getIdTokenResult(user).then((idTokenResult) => {
          if (idTokenResult.claims['role'] === 3000) {
            this._isProfessor.next(true);
          }
        });

        this.userFirestore$ = this.afs.doc<User>(`users/${user.uid}`).valueChanges().pipe(take(1), trace('firestore'));

        this.renderAztecCode(user.uid);
      }
    });
  }

  ngOnInit() {
    /* registerSwiper();
    const swiperEl = document.querySelector('swiper-container');

    const swiperParams: SwiperOptions = {
      slidesPerView: 'auto',
      centeredSlides: true,
      spaceBetween: 30,
      pagination: {
        enabled: true,
        clickable: true,
      },
      direction: 'horizontal',
      mousewheel: true,
      breakpoints: {
        1094: {
          slidesPerView: 2,
          centeredSlides: true,
          spaceBetween: 30,
          mousewheel: true,
          direction: 'horizontal',
        },
      },
    };

    // now we need to assign all parameters to Swiper element
    Object.assign(swiperEl, swiperParams);

    // and now initialize it
    swiperEl.initialize();

    this.render2DBarcode('123321');*/
  }

  renderAztecCode(uid: string) {
    try {
      let svg: string = String(
        azteccode(
          {
            bcid: 'interleaved2of5',
            text: `uid:${uid}`,
            scale: 3,
            includetext: false,
            //@ts-ignore
            eclevel: '23',
          },
          drawingSVG(),
        ),
      );

      this.profileBarcode = svg;
    } catch (err) {
      console.error(err);
    }
  }

  render2DBarcode(uid: string) {
    try {
      let svg: string = String(
        interleaved2of5(
          {
            bcid: 'interleaved2of5',
            text: uid,
            scale: 3,
            height: 15,
          },
          drawingSVG(),
        ),
      );

      this.restaurantBarcode = svg;
    } catch (err) {
      console.error(err);
    }
  }
}
