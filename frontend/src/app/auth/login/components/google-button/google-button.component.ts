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
    this.loadGsiClient();
  }

  handleCredentialResponse(response: CredentialResponse): void {
    this.authService.GoogleOneTap(response);
  }

  ngAfterViewInit() {
    if (environment.production) {
      // @ts-expect-error - google is defined by loadGsiClient();
      window.onGoogleLibraryLoad = () => {
        console.debug('DEBUG: GoogleButtonComponent: GSI Client loaded');

        // @ts-expect-error - google is defined by loadGsiClient();
        google.accounts.id.initialize({
          // Ref: https://developers.google.com/identity/gsi/web/reference/js-reference#IdConfiguration
          client_id: '169157391934-n61n94q5pdv1uloqnejher4v9fudd9g7.apps.googleusercontent.com',
          callback: this.handleCredentialResponse.bind(this),
          auto_select: true,
          cancel_on_tap_outside: false,
        });

        // @ts-expect-error - google is defined by loadGsiClient();
        google.accounts.id.renderButton(this.googleButton.nativeElement, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          type: 'standard',
          logo_alignment: 'left',
          width: 300,
        });

        this.isLoaded.set(true);
      };
    }
  }

  /**
   * Loads the Google Sign-In (GSI) client by dynamically creating a script element and appending it to the document body.
   * The GSI client script is fetched from 'https://accounts.google.com/gsi/client'.
   * @returns {void}
   */
  loadGsiClient(): void {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.nonce = fetchNonce();
    this.document.body.appendChild(script);
  }
}
