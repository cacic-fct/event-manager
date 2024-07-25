import { AfterViewInit, Component, ElementRef, ViewChild, WritableSignal, inject, signal } from '@angular/core';
import { AuthService } from 'src/app/shared/services/auth.service';
import { CredentialResponse } from 'google-one-tap';
import { environment } from 'src/environments/environment';
import { IonSpinner, IonButton, IonSkeletonText } from '@ionic/angular/standalone';
import { CommonModule, DOCUMENT } from '@angular/common';
import { fetchNonce } from 'src/main';

@Component({
  selector: 'app-google-button',
  templateUrl: './google-button.component.html',
  styleUrls: ['./google-button.component.scss'],
  standalone: true,
  imports: [IonSkeletonText, IonSpinner, IonButton, CommonModule],
})
export class GoogleButtonComponent implements AfterViewInit {
  @ViewChild('googleButton') googleButton: ElementRef = new ElementRef({});
  document = inject(DOCUMENT);

  public environment = environment;

  public isLoaded: WritableSignal<boolean> = signal(false);

  constructor(public authService: AuthService) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.nonce = fetchNonce();
    this.document.body.appendChild(script);
  }

  handleCredentialResponse(response: CredentialResponse) {
    this.authService.GoogleOneTap(response);
  }

  ngAfterViewInit() {
    if (environment.production) {
      let attempt = 0;
      //@ts-expect-error - google is defined by the script in index.html
      while (!google) {
        setTimeout(() => {
          console.debug('DEBUG: GoogleButtonComponent: Waiting for google auth to load. Sleeping for 1 second.');
        }, 1000);

        attempt++;

        if (attempt > 4) {
          throw new Error('Google auth failed to load');
        }
      }

      //@ts-expect-error - google is defined by the script in index.html
      google.accounts.id.initialize({
        // Ref: https://developers.google.com/identity/gsi/web/reference/js-reference#IdConfiguration
        client_id: '169157391934-n61n94q5pdv1uloqnejher4v9fudd9g7.apps.googleusercontent.com',
        callback: this.handleCredentialResponse.bind(this),
        auto_select: true,
        cancel_on_tap_outside: false,
      });

      //@ts-expect-error - google is defined by the script in index.html
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
}
