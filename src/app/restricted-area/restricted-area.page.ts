import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addIcons } from "ionicons";
import { listOutline, peopleOutline } from "ionicons/icons";
import { IonRouterLink, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonItem, IonIcon, IonLabel } from "@ionic/angular/standalone";

@Component({
    selector: 'app-restricted-area',
    templateUrl: './restricted-area.page.html',
    styleUrls: ['./restricted-area.page.scss'],
    standalone: true,
    imports: [RouterLink, IonRouterLink, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonItem, IonIcon, IonLabel],
})
export class RestrictedAreaPage implements OnInit {
    constructor() {
        addIcons({ listOutline, peopleOutline });
    }

    ngOnInit() { }
}
