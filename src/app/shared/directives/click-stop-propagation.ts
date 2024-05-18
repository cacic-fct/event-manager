// Attribution: dns253
// https://stackoverflow.com/questions/35274028/stop-mouse-event-propagation

import { Directive, HostListener } from '@angular/core';

@Directive({
  selector: '[click-stop-propagation]',
  standalone: true,
})
export class ClickStopPropagation {
  @HostListener('click', ['$event'])
  public onClick(event: any): void {
    event.stopPropagation();
  }
}
