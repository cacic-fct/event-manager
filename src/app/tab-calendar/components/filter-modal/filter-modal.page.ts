import { KeyValue } from '@angular/common';
import { AfterViewInit, Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { CoursesService } from 'src/app/shared/services/courses.service';

@Component({
  selector: 'app-filter-modal',
  templateUrl: './filter-modal.page.html',
  styleUrls: ['./filter-modal.page.scss'],
})
export class FilterModalPage implements OnInit, AfterViewInit {
  courses = CoursesService.courses;

  constructor(private modalController: ModalController) {}

  @Input() selectedFilter: {
    courses: Array<string>;
  };

  ngAfterViewInit() {
    const elements: HTMLCollectionOf<any> = document.getElementsByClassName('course');

    for (let i = 0; i < elements.length; i++) {
      // Check checkboxes that have id matching selectedFilter
      if (this.selectedFilter['courses'].includes(elements[i].id)) {
        elements[i].checked = true;
      }
    }
  }

  ngOnInit() {}

  checkBoxClickCourse(coursekey: string) {
    let coursesArray = this.selectedFilter['courses'];
    // Add coursekey to array if not present. If present, remove it
    if (coursesArray.includes(coursekey)) {
      coursesArray.splice(coursesArray.indexOf(coursekey), 1);
    } else {
      coursesArray.push(coursekey);
    }
    this.selectedFilter['courses'] = coursesArray;
  }
  uncheckAll() {
    // Get elements with course.key id
    const elements: HTMLCollectionOf<any> = document.getElementsByClassName('course');
    // Uncheck all elements
    for (let i = 0; i < elements.length; i++) {
      elements[i].checked = false;
    }
    // Clear all selectedFilter keys
    this.selectedFilter['courses'] = [];
  }

  dismissModal() {
    this.modalController.dismiss({
      dismissed: true,
      selectedFilter: this.selectedFilter,
    });
  }

  originalOrder = (a: KeyValue<any, any>, b: KeyValue<any, any>): number => {
    return 0;
  };
}
