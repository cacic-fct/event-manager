import { Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { GlobalConstantsService } from '../shared/services/global-constants.service';

@Component({
  selector: 'app-page-settings',
  templateUrl: './page-settings.page.html',
  styleUrls: ['./page-settings.page.scss'],
})
export class PageSettingsPage implements OnInit {
  constructor(public router: Router) {}

  isUnesp: boolean;

  ngOnInit() {
    if (localStorage.getItem('isUnesp') === 'true') {
      this.isUnesp = true;
    } else {
      this.isUnesp = false;
    }
  }

  isUnespFun(event) {
    localStorage.setItem('isUnesp', event.detail.checked);
    localStorage.setItem(
      'userDataVersion',
      GlobalConstantsService.userDataVersion
    );
    // Reload cuz calendar doesn't listen to localStorage changes
    // TODO: Fix this
    window.location.reload();
  }
}
