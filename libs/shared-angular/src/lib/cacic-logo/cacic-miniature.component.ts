import { Component, input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'lib-cacic-miniature',
  templateUrl: './cacic-miniature.component.html',
  styleUrls: ['./cacic-miniature.component.scss'],
  imports: [],
})
export class CacicMiniatureComponent {
  fillColor = input<string>('#000');
  width = input<string>('100%');
  height = input<string>('100%');
}
