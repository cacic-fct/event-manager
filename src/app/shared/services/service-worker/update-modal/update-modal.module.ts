import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UpdateModalComponent } from './update-modal.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [UpdateModalComponent],
})
export class UpdateModalComponentModule {}
