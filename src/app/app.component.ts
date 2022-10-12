import { ServiceWorkerService } from './shared/services/service-worker.service';
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(private swService: ServiceWorkerService) {}
}
