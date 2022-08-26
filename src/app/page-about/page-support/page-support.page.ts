import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-page-support',
  templateUrl: './page-support.page.html',
  styleUrls: ['./page-support.page.scss'],
})
export class PageSupportPage implements OnInit {
  hasServiceWorker: boolean = false;

  constructor() {
    if ('serviceWorker' in navigator) {
      this.hasServiceWorker = true;
    }
  }

  ngOnInit() {}

  updateServiceWorker() {
    if (this.hasServiceWorker) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.update();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }

  unregisterServiceWorker() {
    if (this.hasServiceWorker) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }
}
