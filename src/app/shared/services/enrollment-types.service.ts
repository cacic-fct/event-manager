// @ts-strict-ignore
export class EnrollmentTypesService {
  public static enrollmentTypes = {
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

  getEnrollmentType(type: number | string | undefined | unknown): string {
    if (typeof type === 'number' || type === 'string') {
      return EnrollmentTypesService.enrollmentTypes[type].name;
    }

    return 'Tipo de inscrição não definido';
  }
}
