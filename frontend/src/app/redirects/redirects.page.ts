import { Component, inject, Input, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonButton, IonLoading } from '@ionic/angular/standalone';

@Component({
  selector: 'app-redirects',
  templateUrl: './redirects.page.html',
  styleUrls: ['./redirects.page.scss'],
  standalone: true,
  imports: [IonContent, IonButton, IonLoading],
})
export class RedirectsPage implements OnInit {
  @Input() id: string | undefined;
  private document = inject(DOCUMENT);
  private router = inject(Router);

  public loadingOpen = true;
  public shouldShowButton = false;

  ngOnInit(): void {
    this.redirect();

    setTimeout(() => {
      this.loadingOpen = false;
      this.shouldShowButton = true;
    }, 1000);
  }

  redirect() {
    switch (this.id) {
      case 'docs':
        this.document.location.href = 'https://docs.fctapp.cacic.dev.br';
        break;
      case 'privacy-policy':
        this.document.location.href = 'https://cacic.dev.br/legal/privacy-policy';
        break;
      default:
        this.loadingOpen = false;
        this.router.navigate(['/']);
        break;
    }
  }
}
