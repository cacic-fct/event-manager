import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-developer',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './developer.html',
  styleUrl: './value-proposition.component.scss',
})
export class Developer {}
