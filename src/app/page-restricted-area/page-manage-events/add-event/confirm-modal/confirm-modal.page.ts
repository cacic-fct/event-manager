import { FormGroup } from '@angular/forms';
import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { parseISO } from 'date-fns';
import { parse } from 'twemoji-parser';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.page.html',
  styleUrls: ['./confirm-modal.page.scss'],
})
export class ConfirmModalPage implements OnInit {
  @Input() dataForm: FormGroup<any>;
  @Input() hasDateEnd: boolean;

  courses = CoursesService.courses;
  constructor(private sanitizer: DomSanitizer, public modalController: ModalController) {}

  ngOnInit() {}
  getDateFromTimestamp(isoString: string): Date {
    return parseISO(isoString);
  }

  getCourse(course: string): string {
    if (this.courses[course]) {
      return this.courses[course].name;
    }
    return '';
  }

  toUppercase(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
