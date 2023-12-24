import { Component, OnInit } from '@angular/core';
import { ContactEjsComponent } from './components/contact-ejs/contact-ejs.component';
import { ContactCasComponent } from './components/contact-cas/contact-cas.component';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent } from "@ionic/angular/standalone";

@Component({
    selector: 'app-student-organizations',
    templateUrl: './student-organizations.page.html',
    styleUrls: ['./student-organizations.page.scss'],
    standalone: true,
    imports: [
        ContactCasComponent,
        ContactEjsComponent,
        IonHeader,
        IonToolbar,
        IonButtons,
        IonBackButton,
        IonTitle,
        IonContent
    ],
})
export class StudentOrganizationsPage implements OnInit {
    constructor() { }

    ngOnInit() { }
}
