import { Injectable } from '@angular/core';

export interface Committee {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  members: {
    name: string;
    role: string;
    joinedDate: Date | null;
    leftDate: Date | null;
  }[];
}
@Injectable({
  providedIn: 'root',
})
export class CommitteesService {
  committees: Committee[] = [
    {
      name: 'Sistemas SECOMPP24',
      description: 'Comissão responsável pelo desenvolvimento do FCT App e da homepage da SECOMPP24.',
      startDate: new Date('2024-04-17'),
      endDate: null,
      members: [
        {
          name: 'Daniel Serezane',
          role: 'Líder, núcleo',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Renan Yudi',
          role: 'Sub-líder, núcleo',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Karolyne Marques',
          role: 'Núcleo, coordenadora de Front end',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Willian Murayama',
          role: 'Núcleo, coordenador de Back end',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Guilherme Batalhoti',
          role: 'Núcleo, coordenador de DevOps',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Luiz Henrique Serafim',
          role: 'Apoio do CACiC',
          joinedDate: new Date('2024-04-21'),
          leftDate: null,
        },
        {
          name: 'Igor José Rodrigues',
          role: 'Apoio do CACiC',
          joinedDate: new Date('2024-06-02'),
          leftDate: null,
        },
      ],
    },
  ];
}
