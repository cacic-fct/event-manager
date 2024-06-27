import { Component, OnInit, inject, signal, WritableSignal, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonRow, IonCol, IonItem, IonAvatar, IonLabel, IonCard, IonIcon } from '@ionic/angular/standalone';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

import { Auth, user, User } from '@angular/fire/auth';

import { trace } from '@angular/fire/compat/performance';
import { ClickStopPropagationDirective } from 'src/app/shared/directives/click-stop-propagation';
import { addIcons } from 'ionicons';
import { logInOutline } from 'ionicons/icons';

@UntilDestroy()
@Component({
  selector: 'app-profile-item-card',
  templateUrl: './profile-item-card.component.html',
  styleUrls: ['./profile-item-card.component.scss'],
  imports: [
    IonIcon,
    IonCard,
    IonAvatar,
    IonItem,
    IonLabel,
    IonRow,
    IonCol,
    IonButton,
    RouterLink,
    ClickStopPropagationDirective,
  ],
  standalone: true,
})
export class ProfileItemCardComponent implements OnInit {
  @Input() displayShortcutButtons = false;
  @Input() routerLinkTo = '/perfil';
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  userData: WritableSignal<User | null> = signal(null);

  constructor() {
    addIcons({
      logInOutline,
    });
  }

  ngOnInit() {
    this.user$.pipe(untilDestroyed(this), trace('auth')).subscribe((user) => {
      if (user) {
        this.userData.set(user);
      } else {
        this.userData.set(null);
      }
    });
  }
}
