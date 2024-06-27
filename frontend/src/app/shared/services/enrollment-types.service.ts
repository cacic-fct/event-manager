import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EnrollmentTypesService {
  public static enrollmentTypes: enrollmentTypesList = {
    0: {
      name: 'Aluno da Unesp',
    },
    1: {
      name: 'Alunos de outras instituições',
    },
    2: {
      name: 'Professores e profissionais',
    },
  };

  getEnrollmentType(type: number | string | undefined): string {
    if (typeof type === 'string') {
      type = parseInt(type, 10);
    }

    if (typeof type === 'number') {
      return EnrollmentTypesService.enrollmentTypes[type].name;
    }

    return 'Tipo de inscrição não definido';
  }
}

type enrollmentTypesList = Record<
  number,
  {
    name: string;
  }
>;
