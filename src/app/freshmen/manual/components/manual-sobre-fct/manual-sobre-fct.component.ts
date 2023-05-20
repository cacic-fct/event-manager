import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-manual-sobre-fct',
  templateUrl: './manual-sobre-fct.component.html',
  styleUrls: ['./manual-sobre-fct.component.scss', '../../manual.page.scss'],
})
export class ManualSobreFctComponent implements OnInit {
  timelineDescription =
    'Linha do tempo que mostra o histórico da FCT ao longo dos anos. Inicia-se em 1957, com a criação da faculdade de filosofia ciências e letras de Presidente Prudente. Em 3 de maio de 1959, começam a operar os cursos de geografia e pedagogia. Em 1963, começam a operar os cursos de matemática e ciências sociais. Em 1969, inicia-se o curso de licenciatura em ciências. Em 1970, a faculdade se torna uma autarquia de regime especial junto com mais 14 institutos isolados de ensino superior. Em 1975, começa a operar o curso de estudos sociais. Em 1976, a lei 952 criou a Universidade Estadual Paulista "Júlio de Mesquita Filho". A faculdade passa a se chamar "Instituto de planejamento e estudos ambientais, o IPEA". Nesta mesma época, foram extintos os cursos de pedagogia, ciências sociais e licenciatura em ciências e estudos sociais. Em 1977, é implantado o curso de engenharia cartográfica. Em 1984, inicia-se o curso de estatística. Em 1987, é implantado o programa de pós-graduação em geografia, com mestrado na área de concentração "ambiente e sociedade". Em 1988, passam a funcionar os cursos de educação física, fisioterapia e pedagogia, com a incorporação do Instituto Municipal de Ensino Superior de Presidente Prudente, o IMESPP. Em 1989, a denonimação IPEA foi alterada para "Faculdade de Ciências e Tecnologia", a FCT. Em 1994, inicia-se o programa de doutorado na área de "desenvolvimento regional e planejamento ambiental" no programa de pós-graduação em geografia. Em 1997, passa a operar o mestrado na área de "aquisição, análise e representação de informações espaciais" da pós-graduação em ciências cartográficas. Permanece sendo o único no país com essa denominação. Em 2000, iniciam-se o mestrado na área de concentração "formação inicial e continuada de professores" da pós-graduação em geografia e o doutorado em ciências cartográficas. Em 2002 são implementados os cursos de ciência da computação, engenharia ambiental e física. Em 2003 vieram os cursos de arquitetura e urbanismo e química. Em 2004, foi implementado o mestrado e doutorado no programa de pós-graduação em ciência e tecnologia de materiais. Em 2008, foi implementado a pós-graduação em fisioterapia na área de concentração "avaliação e intervenção em fisioterapia". Pulando um pouco no tempo, estamos nos dias atuais.';

  cursos = [
    {
      nome: 'Arquitetura e urbanismo',
      duracao: '5',
      periodo: 'Integral',
      vagas: 40,
    },
    {
      nome: 'Ciência da computação',
      duracao: '4',
      periodo: 'Vespertino e noturno',
      vagas: 35,
    },
    {
      nome: 'Educação física',
      duracao: '4',
      periodo: 'Integral ou vespertino e noturno',
      vagas: 45,
    },
    {
      nome: 'Engenharia ambiental',
      duracao: '5',
      periodo: 'Integral',
      vagas: 35,
    },
    {
      nome: 'Engenharia cartográfica e de agrimensura',
      duracao: '5',
      periodo: 'Integral',
      vagas: 40,
    },
    {
      nome: 'Estatística',
      duracao: '4',
      periodo: 'Integral',
      vagas: 30,
    },
    {
      nome: 'Física',
      duracao: '4',
      periodo: 'Noturno',
      vagas: 30,
    },
    {
      nome: 'Fisioterapia',
      duracao: '4',
      periodo: 'Integral',
      vagas: 45,
    },
    {
      nome: 'Geografia',
      duracao: '4',
      periodo: 'Matutino ou noturno',
      vagas: 40,
    },
    {
      nome: 'Matemática',
      duracao: '4',
      periodo: 'Matutino ou noturno',
      vagas: 40,
    },
    {
      nome: 'Pedagogia',
      duracao: '4/5',
      periodo: 'Vespertino ou noturno',
      vagas: 45,
    },
    {
      nome: 'Química',
      duracao: '5',
      periodo: 'Noturno',
      vagas: 40,
    },
  ];
  constructor() {}

  ngOnInit() {}
}
