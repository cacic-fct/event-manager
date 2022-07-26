import { Component, OnInit } from '@angular/core';
import { GlobalConstantsService } from '../shared/services/global-constants.service';

@Component({
  selector: 'app-page-about',
  templateUrl: './page-about.page.html',
  styleUrls: ['./page-about.page.scss'],
})
export class PageAboutPage implements OnInit {
  globalConstants = GlobalConstantsService;
  constructor() {}

  ngOnInit() {}
}
