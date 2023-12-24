import { Component, OnInit } from '@angular/core';
import { FaqAccordionComponent } from './components/faq-accordion/faq-accordion.component';
import { StepsAccordionComponent } from './components/steps-accordion/steps-accordion.component';
import { MarkdownModule } from 'ngx-markdown';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent } from "@ionic/angular/standalone";

@Component({
    selector: 'app-welcome',
    templateUrl: './welcome.page.html',
    styleUrls: ['./welcome.page.scss'],
    standalone: true,
    imports: [
        MarkdownModule,
        StepsAccordionComponent,
        FaqAccordionComponent,
        IonHeader,
        IonToolbar,
        IonButtons,
        IonBackButton,
        IonTitle,
        IonContent
    ],
})
export class WelcomePage implements OnInit {
    constructor() { }

    ngOnInit() { }
}
