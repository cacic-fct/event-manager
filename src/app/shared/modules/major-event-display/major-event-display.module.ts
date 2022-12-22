import { PriceComponent } from './price/price.component';
import { DateComponent } from './date/date.component';
import { DescriptionComponent } from './description/description.component';
import { HeaderComponent } from './header/header.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@NgModule({
  declarations: [HeaderComponent, DescriptionComponent, DateComponent, PriceComponent],
  imports: [CommonModule, IonicModule],
  exports: [HeaderComponent, DescriptionComponent, DateComponent, PriceComponent],
})
export class MajorEventDisplayModule {}
