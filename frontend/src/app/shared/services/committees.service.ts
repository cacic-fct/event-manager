import { Injectable } from '@angular/core';

export interface Committee {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  members: {
    name: string;
    email: string | null;
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
          email: 'daniel.serezane@unesp.br',
          role: 'Líder, núcleo',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Renan Yudi',
          email: 'unesp@yudi.me',
          role: 'Sub-líder, núcleo',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Karolyne Marques',
          email: null,
          role: 'Núcleo, coordenadora de Front end',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Willian Murayama',
          email: null,
          role: 'Núcleo, coordenador de Back end',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Guilherme Batalhoti',
          email: null,
          role: 'Núcleo, coordenador de DevOps',
          joinedDate: new Date('2024-04-17'),
          leftDate: null,
        },
        {
          name: 'Matheus Nazaro',
          email: null,
          role: 'Subcoordenador da Homepage da SECOMPP',
          joinedDate: new Date('2024-07-19'),
          leftDate: null,
        },
        {
          name: 'Abigail Nakashima',
          email: null,
          role: 'Membro de front end, FCT App e Homepage da SECOMPP',
          joinedDate: new Date('2024-07-19'),
          leftDate: null,
        },
        {
          name: 'Caio Tavares',
          email: null,
          role: 'Membro de back end e DevOps',
          joinedDate: new Date('2024-07-19'),
          leftDate: null,
        },
        {
          name: 'Paulo Sérgio de Lima',
          email: null,
          role: 'Membro de back end e DevOps',
          joinedDate: new Date('2024-07-19'),
          leftDate: null,
        },
        {
          name: 'Luiz Henrique Serafim',
          email: null,
          role: 'Apoio do CACiC',
          joinedDate: new Date('2024-04-21'),
          leftDate: null,
        },
        {
          name: 'Igor José Rodrigues',
          email: null,
          role: 'Apoio do CACiC',
          joinedDate: new Date('2024-06-02'),
          leftDate: null,
        },
      ],
    },
  ];
}
