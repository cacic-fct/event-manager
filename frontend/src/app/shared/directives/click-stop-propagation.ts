// Attribution: dns253
// https://stackoverflow.com/questions/35274028/stop-mouse-event-propagation

import { Directive, HostListener } from '@angular/core';

@Directive({
  selector: '[appClickStopPropagation]',
  standalone: true,
})
export class ClickStopPropagationDirective {
  @HostListener('click', ['$event'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public onClick(event: any): void {
    event.stopPropagation();
  }
}
