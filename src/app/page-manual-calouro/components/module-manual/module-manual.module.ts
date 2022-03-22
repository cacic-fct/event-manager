import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ManualSobreFctComponent } from './../manual-sobre-fct/manual-sobre-fct.component';
import { ManualIntroducaoComponent } from './../manual-introducao/manual-introducao.component';
import { ManualAuxiliosComponent } from './../manual-auxilios/manual-auxilios.component';
import { ManualMovimentoEstudantilComponent } from './../manual-movimento-estudantil/manual-movimento-estudantil.component';
import { ManualGlossarioComponent } from './../manual-glossario/manual-glossario.component';
import { ManualMapaComponent } from './../manual-mapa/manual-mapa.component';
import { ManualPresidentePrudenteComponent } from './../manual-presidente-prudente/manual-presidente-prudente.component';

import { MarkdownModule } from 'ngx-markdown';

import { IonicModule } from '@ionic/angular';

@NgModule({
  declarations: [
    ManualAuxiliosComponent,
    ManualIntroducaoComponent,
    ManualSobreFctComponent,
    ManualMovimentoEstudantilComponent,
    ManualGlossarioComponent,
    ManualMapaComponent,
    ManualPresidentePrudenteComponent,
  ],
  imports: [CommonModule, MarkdownModule.forChild(), IonicModule],
  exports: [
    ManualAuxiliosComponent,
    ManualIntroducaoComponent,
    ManualSobreFctComponent,
    ManualMovimentoEstudantilComponent,
    ManualGlossarioComponent,
    ManualMapaComponent,
    ManualPresidentePrudenteComponent,
  ],
})
export class ModuleManualModule {}
