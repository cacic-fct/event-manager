export class EnrollmentTypesService {
  public static enrollmentTypes = {
    0: {
      name: 'Aluno da Unesp',
    },
    1: {
      name: 'Aluno de outras instituições de ensino superior',
    },
    2: {
      name: 'Professor',
    },
  };

  getEnrollmentType(type: number | string | undefined | unknown): string {
    if (typeof type === 'number' || type === 'string') {
      return EnrollmentTypesService.enrollmentTypes[type].name;
    }

    return 'Tipo de inscrição não definido';
  }
}
