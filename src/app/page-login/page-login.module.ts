import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageLoginPageRoutingModule } from './page-login-routing.module';

import { PageLoginPage } from './page-login.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageLoginPageRoutingModule],
  declarations: [PageLoginPage],
})
export class PageLoginPageModule {}
