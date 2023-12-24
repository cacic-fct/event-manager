import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';
import { IonList, IonAccordionGroup, IonAccordion, IonItem, IonLabel } from "@ionic/angular/standalone";

@Component({
    selector: 'app-faq-accordion',
    templateUrl: './faq-accordion.component.html',
    styleUrls: ['./faq-accordion.component.scss'],
    standalone: true,
    imports: [MarkdownModule, IonList, IonAccordionGroup, IonAccordion, IonItem, IonLabel],
})
export class FaqAccordionComponent implements OnInit {
    constructor() { }

    ngOnInit() { }
}
