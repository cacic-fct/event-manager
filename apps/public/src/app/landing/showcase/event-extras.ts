import { Component } from '@angular/core';
import { SportsDemoComponent } from './sports-demo';
import { FeedbackDemoComponent } from './feedback-demo';

@Component({
  selector: 'app-landing-event-extras',
  imports: [SportsDemoComponent, FeedbackDemoComponent],
  templateUrl: './event-extras.html',
  styleUrl: './event-extras.scss',
})
export class EventExtrasComponent {}
