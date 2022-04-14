import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-page-profile',
  templateUrl: './page-profile.page.html',
  styleUrls: ['./page-profile.page.scss'],
})
export class PageProfilePage implements OnInit {
  user: any;
  constructor() {}

  ngOnInit() {
    this.user = JSON.parse(localStorage.getItem('user'));
  }
}
