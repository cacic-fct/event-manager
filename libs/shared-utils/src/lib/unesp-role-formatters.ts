export const UNESP_ROLE_LABELS: Readonly<Record<string, string>> = {
  'aluno-pos-graduacao': 'Aluno da pós-graduação',
  egresso: 'Egresso',
  professor: 'Professor',
  'professor-substituto': 'Professor substituto',
  'servidor-tecnico-administrativo': 'Servidor técnico-administrativo',
  external: 'Externo',
};

export const UNESP_GRADUATION_COURSE_LABELS: Readonly<Record<string, string>> = {
  '12': 'Aluno de Ciência da Computação',
};

export function formatUnespRole(
  role: string | readonly string[] | null | undefined,
  enrollmentNumber?: string | null,
): string {
  const primaryRole = Array.isArray(role) ? role[0] : role;

  if (!primaryRole) {
    return '';
  }

  if (primaryRole === 'aluno-graduacao') {
    const courseCode = enrollmentNumber?.substring(2, 4);

    return UNESP_GRADUATION_COURSE_LABELS[courseCode ?? ''] ?? 'Aluno da Graduação';
  }

  return UNESP_ROLE_LABELS[primaryRole] ?? primaryRole;
}
