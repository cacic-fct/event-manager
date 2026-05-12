import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AGPL } from './agpl';
import { DisplayLicenses } from './display-licenses';

@Component({
  selector: 'app-legal',
  imports: [MatToolbarModule, MatIconModule, MatButtonModule, RouterLink, AGPL, DisplayLicenses],
  templateUrl: './legal.html',
  styleUrl: './legal.css',
})
export class Legal {}
