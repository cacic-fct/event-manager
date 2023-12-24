import { Component, AfterViewInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { useGeographic } from 'ol/proj';

import { MarkerService } from './components/manual-mapa/marker.service';
import { ManualGlossarioComponent } from './components/manual-glossario/manual-glossario.component';
import { ManualPresidentePrudenteComponent } from './components/manual-presidente-prudente/manual-presidente-prudente.component';
import { ManualAuxiliosComponent } from './components/manual-auxilios/manual-auxilios.component';
import { ManualMovimentoEstudantilComponent } from './components/manual-movimento-estudantil/manual-movimento-estudantil.component';
import { ManualSobreFctComponent } from './components/manual-sobre-fct/manual-sobre-fct.component';
import { ManualIntroducaoComponent } from './components/manual-introducao/manual-introducao.component';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton } from "@ionic/angular/standalone";

@Component({
    selector: 'app-manual',
    templateUrl: './manual.page.html',
    styleUrls: ['./manual.page.scss'],
    standalone: true,
    imports: [
        ManualIntroducaoComponent,
        ManualSobreFctComponent,
        ManualMovimentoEstudantilComponent,
        ManualAuxiliosComponent,
        ManualPresidentePrudenteComponent,
        ManualGlossarioComponent,
        IonHeader,
        IonToolbar,
        IonButtons,
        IonBackButton,
        IonTitle,
        IonContent,
        IonButton
    ],
})
export class ManualPage implements AfterViewInit {
    map: Map | undefined | null;
    constructor(private markerService: MarkerService) { }

    ngAfterViewInit() {
        useGeographic();
        const rasterLayer = new TileLayer({
            source: new OSM(),
        });

        setTimeout(() => {
            this.map = new Map({
                view: new View({
                    center: [-51.40775, -22.12103],
                    zoom: 15,
                    maxZoom: 19,
                    projection: 'EPSG:3857',
                }),
                layers: [rasterLayer],
                target: 'ol-map-manual',
            });
            this.markerService.makeGroceriesMarkers(this.map);
        }, 500);
    }

    ngOnDestroy() {
        // Remove map on leave if it exists
        if (this.map) {
            this.map.setTarget(undefined);
            this.map = null;
        }
    }

    reloadMap() {
        this.map?.updateSize();
    }
}
