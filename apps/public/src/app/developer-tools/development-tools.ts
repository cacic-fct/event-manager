import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-development-tools',
  imports: [MatListModule, RouterLink, MatIconModule, MatToolbar, MatButtonModule],
  templateUrl: './development-tools.html',
  styleUrl: './development-tools.css',
})
export class DevelopmentTools {}
