import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-contact-cas',
  templateUrl: './contact-cas.component.html',
  styleUrls: ['./contact-cas.component.scss'],
})
export class ContactCasComponent implements OnInit {
  contacts: any = [
    {
      course: 'Ciência da Computação',
      acronym: 'CACiC',
      email: 'cacic.fct@gmail.com',
      website: 'https://cacic-fct.web.app',
      social: {
        facebook: 'cacic.fct',
        instagram: 'cacic.fct',
        youtube: 'UCoYH_4dyIQHx2Kad-HG6aNA',
      },
    },
    {
      course: 'Arquitetura e Urbanismo',
      acronym: 'CACAU',
      social: {
        facebook: '',
        instagram: 'cacau.unespp',
      },
    },
    {
      course: 'Educação Física',
      acronym: 'CAEF',
      social: {
        facebook: '',
        instagram: 'caef_fct',
      },
    },
    {
      course: 'Engenharia Ambiental',
      acronym: 'CAEA',
      email: 'caeng.ambiental@gmail.com',
      social: {
        facebook: '',
        instagram: 'caengambiental',
      },
    },
    {
      course: 'Engenharia Cartográfica e de Agrimensura',
      acronym: 'CAMA',
      social: {
        facebook: '',
        instagram: 'cacartografica',
      },
    },
    {
      course: 'Estatística',
      acronym: 'CAE',
      social: {
        facebook: '',
        instagram: 'cae_unesp',
      },
    },
    // {
    //   course: 'Física',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
    {
      course: 'Fisioterapia',
      acronym: 'CAF',
      social: {
        facebook: '',
        instagram: 'caf.unesp',
      },
    },
    {
      course: 'Geografia',
      acronym: 'CAGEO',
      social: {
        facebook: 'cageo.geografia',
        instagram: 'cageo.fctunesp',
        youtube: 'UC5fOz1IJ2_aFqnEDFFEDKAA',
        twitter: 'CageoFct',
      },
    },
    {
      course: 'Matemática',
      acronym: 'CENTRAMA',
      social: {
        facebook: '',
        instagram: 'centramafct',
      },
    },
    // {
    //   course: 'Pedagogia',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
    // {
    //   course: 'Química',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
  ];
  socialMedia = {
    linkedin: 'https://linkedin.com/in/',
    twitter: 'https://twitter.com/',
    facebook: 'https://fb.com/',
    instagram: 'https://instagram.com/',
    youtube: 'https://youtube.com/channel/',
  };
  constructor() {}

  ngOnInit() {}
}
