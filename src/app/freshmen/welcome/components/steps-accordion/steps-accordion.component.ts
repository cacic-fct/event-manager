import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarkdownModule } from 'ngx-markdown';
import {
  IonRouterLink,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonImg,
  IonButton,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-steps-accordion',
  templateUrl: './steps-accordion.component.html',
  styleUrls: ['./steps-accordion.component.scss'],
  standalone: true,
  imports: [
    MarkdownModule,
    RouterLink,
    IonRouterLink,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonImg,
    IonButton,
  ],
})
export class StepsAccordionComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
