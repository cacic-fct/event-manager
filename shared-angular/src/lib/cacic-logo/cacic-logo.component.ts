import { Component, input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'lib-cacic-logo',
  templateUrl: './cacic-logo.component.html',
  styleUrls: ['./cacic-logo.component.scss'],
  imports: [],
})
export class CacicLogoComponent {
  fillColor = input<string>('#000');
  width = input<string>('100%');
  height = input<string>('100%');
}
