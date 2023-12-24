// @ts-strict-ignore
import { ModalController } from '@ionic/angular/standalone';
import { Component, Input, OnInit } from '@angular/core';
import { EventItem } from 'src/app/shared/services/event';
import { DescriptionComponent } from '../../../../shared/modules/event-display/description/description.component';
import { HeaderComponent } from '../../../../shared/modules/event-display/header/header.component';
import { addIcons } from "ionicons";
import { closeOutline } from "ionicons/icons";
import { IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent } from "@ionic/angular/standalone";

@Component({
    selector: 'app-info-modal',
    templateUrl: './info-modal.component.html',
    styleUrls: ['./info-modal.component.scss'],
    standalone: true,
    imports: [
        HeaderComponent,
        DescriptionComponent,
        IonHeader,
        IonToolbar,
        IonButtons,
        IonButton,
        IonIcon,
        IonTitle,
        IonContent
    ],
})
export class InfoModalComponent implements OnInit {
    @Input() event: EventItem;

    constructor(private modalController: ModalController) {
        addIcons({ closeOutline });
    }

    ngOnInit() { }

    closeModal() {
        this.modalController.dismiss();
    }
}
