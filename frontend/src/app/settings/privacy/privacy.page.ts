import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonLabel,
  IonIcon,
  IonItem,
  IonCard,
  IonNote,
  IonBackButton,
  IonButtons,
  IonToggle,
  IonList,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, buildOutline, handLeftOutline } from 'ionicons/icons';
import { ExplanationCardComponent } from 'src/app/settings/components/explanation-card/explanation-card.component';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  standalone: true,
  imports: [
    IonCardContent,
    IonList,
    IonToggle,
    IonButtons,
    IonBackButton,
    IonNote,
    IonCard,
    IonItem,
    IonIcon,
    IonLabel,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    ExplanationCardComponent,
  ],
})
export class PrivacyPage {
  isAnalyticsEnabled: boolean;
  isMonitoringEnabled: boolean;
  constructor() {
    addIcons({
      analyticsOutline,
      buildOutline,
      handLeftOutline,
    });

    const disableAnalytics = localStorage.getItem('disable-analytics');
    if (disableAnalytics !== 'true') {
      this.isAnalyticsEnabled = true;
    } else {
      this.isAnalyticsEnabled = false;
    }

    const disableMonitoring = localStorage.getItem('disable-monitoring');
    if (disableMonitoring !== 'true') {
      this.isMonitoringEnabled = true;
    } else {
      this.isMonitoringEnabled = false;
    }
  }

  toggleAnalytics() {
    this.isAnalyticsEnabled = !this.isAnalyticsEnabled;
    console.debug('DEBUG: Analytics:', this.isAnalyticsEnabled);
    localStorage.setItem('disable-analytics', this.isAnalyticsEnabled ? '' : 'true');
  }

  toggleMonitoring() {
    this.isMonitoringEnabled = !this.isMonitoringEnabled;
    console.debug('DEBUG: Monitoring:', this.isMonitoringEnabled);
    localStorage.setItem('disable-monitoring', this.isMonitoringEnabled ? '' : 'true');
  }
}
