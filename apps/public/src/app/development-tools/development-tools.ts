import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-development-tools',
  imports: [MatListModule, RouterLink, MatIconModule],
  templateUrl: './development-tools.html',
  styleUrl: './development-tools.css',
})
export class DevelopmentTools {}
