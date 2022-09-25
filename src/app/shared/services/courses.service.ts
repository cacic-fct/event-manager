export class CoursesService {
  public static courses = {
    a1: {
      name: 'Para todos os cursos',
    },
    a2: {
      name: 'Movimento estudantil',
      color: '#ff6b6b',
    },
    '12': {
      name: 'Ciência da computação',
      color: '#51aaf2',
    },
  };

  getCourse(course: string): string {
    if (course === undefined) {
      return 'Curso ou RA inválido';
    }

    if (course.length === 9) {
      course = course.slice(2, 4);
    }

    if (course.length === 2) {
      if (CoursesService.courses[course] === undefined) {
        return 'Curso não cadastrado ou RA inválido';
      }
      return CoursesService.courses[course].name;
    }

    return 'Curso ou RA inválido';
  }

  getAssociateStatus(associateStatus: string): string {
    switch (associateStatus) {
      case 'undergraduate':
        return 'Aluno da graduação';
      case 'graduate':
        return 'Aluno da pós-graduação';
      case 'professor':
        return 'Professor';
      case 'adjunctProfessor':
        return 'Professor substituto';
      case 'employee':
        return 'Servidor técnico-administrativo';
      case 'other':
        return 'Outro vínculo com a Unesp';
      default:
        return 'Vínculo inválido';
    }
  }
}
