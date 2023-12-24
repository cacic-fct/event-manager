import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../../shared/services/auth.service';

@Component({
    selector: 'app-google-button',
    templateUrl: './google-button.component.html',
    styleUrls: ['./google-button.component.scss'],
    standalone: true,
})
export class GoogleButtonComponent implements OnInit {
  constructor(public authService: AuthService) {}

  ngOnInit() {}
}
