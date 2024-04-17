import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, WritableSignal, signal } from '@angular/core';
import { AuthService } from 'src/app/shared/services/auth.service';
import { CredentialResponse } from 'google-one-tap';
import { environment } from 'src/environments/environment';
import { IonSpinner, IonButton, IonSkeletonText } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-google-button',
  templateUrl: './google-button.component.html',
  styleUrls: ['./google-button.component.scss'],
  standalone: true,
  imports: [IonSkeletonText, IonSpinner, IonButton, CommonModule],
})
export class GoogleButtonComponent implements AfterViewInit {
  @ViewChild('googleButton') googleButton: ElementRef = new ElementRef({});

  public environment = environment;

  public isLoaded: WritableSignal<boolean> = signal(false);

  constructor(public authService: AuthService) {}

  handleCredentialResponse(response: CredentialResponse) {
    this.authService.GoogleOneTap(response);
  }

  ngAfterViewInit() {
    //@ts-ignore
    google.accounts.id.initialize({
      // Ref: https://developers.google.com/identity/gsi/web/reference/js-reference#IdConfiguration
      client_id: '169157391934-n61n94q5pdv1uloqnejher4v9fudd9g7.apps.googleusercontent.com',
      callback: this.handleCredentialResponse.bind(this),
      auto_select: true,
      cancel_on_tap_outside: false,
    });

    //@ts-ignore
    google.accounts.id.renderButton(this.googleButton.nativeElement, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      type: 'standard',
      logo_alignment: 'left',
      width: 300,
    });

    this.isLoaded.set(true);
  }
}
