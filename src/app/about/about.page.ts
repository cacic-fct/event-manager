import { Component, OnInit } from '@angular/core';
import { GlobalConstantsService } from '../shared/services/global-constants.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
})
export class AboutPage implements OnInit {
  globalConstants = GlobalConstantsService;
  currentYear: number = new Date().getFullYear();

  constructor() {}

  ngOnInit() {}
}
