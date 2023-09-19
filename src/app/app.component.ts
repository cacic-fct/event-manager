import { Component } from '@angular/core';
import { ServiceWorkerService } from 'src/app/shared/services/service-worker.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(private swService: ServiceWorkerService) {}
}
