// TODO: Handle errors
import { Component, inject, OnInit } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { DecimalPipe } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonProgressBar,
  IonContent,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonLabel,
  IonCheckbox,
  IonItem,
  IonButton,
} from '@ionic/angular/standalone';

@UntilDestroy()
@Component({
  selector: 'app-populate-database',
  templateUrl: './populate-database.page.html',
  styleUrls: ['./populate-database.page.scss'],
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonProgressBar,
    IonContent,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonLabel,
    IonCheckbox,
    IonItem,
    IonButton,
  ],
})
export class PopulateDatabasePage implements OnInit {
  private functions: Functions = inject(Functions);
  parseFloat = parseFloat;
  dataForm: FormGroup;

  progress = 0;

  populateStarted = false;

  numberOfSelectedCheckboxes = 0;
  progressPerItem: number;

  constructor(private formBuilder: FormBuilder) {
    this.dataForm = this.formBuilder.group({
      createAdmin: [true],
      createUndergraduate: [true],
      createProfessor: [true],
      createExternal: [true],
      createPaidMajorEvent: [true],
      createEvent: [true],
      createEventGroup: [true],
    });

    // Count the number of selected checkboxes
    Object.keys(this.dataForm.controls).forEach((key) => {
      if (this.dataForm.controls[key].value === true) {
        this.numberOfSelectedCheckboxes++;
      }
    });

    this.progressPerItem = 1 / this.numberOfSelectedCheckboxes;
  }

  ngOnInit() {
    this.dataForm.valueChanges.pipe(untilDestroyed(this)).subscribe(() => {
      this.numberOfSelectedCheckboxes = 0;
      // Count the number of selected checkboxes
      Object.keys(this.dataForm.controls).forEach((key) => {
        if (this.dataForm.controls[key].value === true) {
          this.numberOfSelectedCheckboxes++;
        }
      });

      this.progressPerItem = 1 / this.numberOfSelectedCheckboxes;
    });
  }

  populateDatabase() {
    this.progress = 0;
    this.populateStarted = true;

    if (this.dataForm.get('createAdmin')?.value) {
      this.createAdmin();
    }

    if (this.dataForm.get('createUndergraduate')?.value) {
      this.createUndergraduate();
    }

    if (this.dataForm.get('createProfessor')?.value) {
      this.createProfessor();
    }

    if (this.dataForm.get('createExternal')?.value) {
      this.createExternal();
    }

    if (this.dataForm.get('createPaidMajorEvent')?.value) {
      this.createPaidMajorEvent();
    }

    if (this.dataForm.get('createEvent')?.value) {
      this.createEvent();
    }

    if (this.dataForm.get('createEventGroup')?.value) {
      this.createEventGroup();
    }
  }

  createAdmin() {
    const createAdmin = httpsCallable(this.functions, 'populate_db-create_users-createAdminUser');
    createAdmin(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createUndergraduate() {
    const createUndergraduate = httpsCallable(this.functions, 'populate_db-create_users-createUndergraduateUser');
    createUndergraduate(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createProfessor() {
    const createProfessor = httpsCallable(this.functions, 'populate_db-create_users-createProfessorUser');
    createProfessor(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createExternal() {
    const createExternal = httpsCallable(this.functions, 'populate_db-create_users-createExternalUser');
    createExternal(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createPaidMajorEvent() {
    const createPaidMajorEvent = httpsCallable(this.functions, 'populate_db-create_events-createPaidMajorEvent');
    createPaidMajorEvent(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createEvent() {
    const createEvent = httpsCallable(this.functions, 'populate_db-create_events-createEvent');
    createEvent(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }

  createEventGroup() {
    const createEventGroup = httpsCallable(this.functions, 'populate_db-create_events-createEventGroup');
    createEventGroup(null).then(() => {
      this.progress += this.progressPerItem;
    });
  }
}
