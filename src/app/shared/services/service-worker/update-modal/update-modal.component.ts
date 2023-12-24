import { Component, OnInit } from '@angular/core';
import { IonGrid, IonRow, IonText, IonProgressBar } from "@ionic/angular/standalone";

@Component({
    selector: 'app-update-modal',
    templateUrl: './update-modal.component.html',
    styleUrls: ['./update-modal.component.scss'],
    standalone: true,
    imports: [IonGrid, IonRow, IonText, IonProgressBar],
})
export class UpdateModalComponent implements OnInit {

    constructor() { }

    ngOnInit() { }

}
