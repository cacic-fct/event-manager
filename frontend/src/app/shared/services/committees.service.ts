import { Injectable } from '@angular/core';

export interface Committee {
  name: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  contact: {
    type: 'email' | 'whatsapp' | 'url';
    value: string;
  } | null;
  members: {
    name: string;
    email: string | null;
    role: string | null;
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
      name: 'SECOMPP24',
      description: 'Comissão de alunos responsáveis pela organização da SECOMPP24.',
      startDate: new Date('2024-04-16'),
      endDate: null,
      contact: {
        type: 'email',
        value: 'secompp@googlegroups.com',
      },
      members: secomppCommittee2024,
    },
    {
      name: 'Sistemas SECOMPP24',
      description: 'Comissão responsável pelo desenvolvimento do FCT App e da homepage da SECOMPP24.',
      startDate: new Date('2024-04-17'),
      endDate: null,
      contact: {
        type: 'email',
        value: 'fctapp@googlegroups.com',
      },
      members: systemCommittee2024,
    },
    {
      name: 'Kit Bixo 2024',
      description: 'Comissão responsável pelo Kit Bixo 2024.',
      startDate: null,
      endDate: null,
      contact: null,
      members: kitBixo2024,
    },
  ];
}

const kitBixo2024 = [
  {
    name: 'Gustavo Ribeiro',
    email: 'gustavo.r.mota@unesp.br',
    role: 'Responsável',
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Mateus "Mavincas"',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
];

const secomppCommittee2024 = [
  {
    name: 'Giovanna Custodio',
    email: 'giovanna.s.custodio@unesp.br',
    role: 'Diretora de eventos do CACiC e responsável pela comissão',
    joinedDate: new Date('2024-04-16'),
    leftDate: null,
  },
  {
    name: 'Julio Santana',
    email: 'julio.o.santana@unesp.br',
    role: 'Diretor de eventos do CACiC',
    joinedDate: new Date('2024-04-16'),
    leftDate: null,
  },
  {
    name: 'Gustavo Ribeiro',
    email: 'gustavo.r.mota@unesp.br',
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Abigail Nakashima',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Ana Plaszezeski',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Caroline Araujo',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Eduardo Valero',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Erina Sakakida',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Gabriel Santos',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Igor Marani',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Julia Eller',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Larissa Angelo',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'M. Perez',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Miguel Moret',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Milena Cauana',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Raphael Leiva',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Vinicius Mazzaro',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
  {
    name: 'Yasmin Bonet',
    email: null,
    role: null,
    joinedDate: null,
    leftDate: null,
  },
];

const systemCommittee2024 = [
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
];
