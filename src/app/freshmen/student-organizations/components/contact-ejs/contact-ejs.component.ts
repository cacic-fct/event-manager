import { Component, OnInit } from '@angular/core';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';

import { KeyValuePipe } from '@angular/common';

@Component({
  selector: 'app-contact-ejs',
  templateUrl: './contact-ejs.component.html',
  styleUrls: ['./contact-ejs.component.scss'],
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonButton, IonIcon, KeyValuePipe],
})
export class ContactEjsComponent implements OnInit {
  contacts: any = [
    {
      course: 'Ciência da Computação',
      acronym: 'EJComp',
      email: 'computacaojr@gmail.com',
      website: 'https://www.ejcomp.com.br',
      phone: '+551832295466',
      social: {
        facebook: 'EJComp.UNESP',
        instagram: 'ejcompunesp',
      },
    },
    {
      course: 'Arquitetura e Urbanismo',
      acronym: 'Ópera Krios',
      email: 'operakrios@gmail.com',
      website: 'http://www.operakrios.com.br',
      phone: '+5518997773004',
      social: {
        facebook: 'operakrios',
        instagram: 'operakrios',
      },
    },
    {
      course: 'Educação Física',
      acronym: 'Performance Jr',
      email: 'marketingperformancejr@gmail.com',
      website: 'https://empresaperformance1.wixsite.com/performancejr',
      phone: '+5518997350415',
      social: {
        facebook: 'performance.junior',
        instagram: 'performance.jr',
      },
    },
    {
      course: 'Geografia e Engenharia Ambiental',
      acronym: 'GeoAmbiental Jr.',
      email: 'acessogajr@gmail.com',
      website: 'https://www.geoambientaljr.com/',
      phone: '+5517997212929',
      social: {
        facebook: 'GeoAmbientalJr',
        instagram: 'geoambientaljr',
        linkedin: 'geoambiental-jr',
      },
    },
    {
      course: 'Engenharia Cartográfica e de Agrimensura',
      acronym: 'EJECart',
      email: 'contato.ejecart@gmail.com',
      phone: '+551832295411',
      social: {
        facebook: 'ejecart',
        instagram: 'ejecart',
      },
    },
    {
      course: 'Estatística',
      acronym: 'EJEST',
      email: 'ejest.unesp@gmail.com',
      phone: '+551832295413',
      social: {
        facebook: 'ejest.consultoria',
        instagram: 'ejest.unesp',
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
    // {
    //   course: 'Fisioterapia',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
    // {
    //   course: 'Geografia',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
    // {
    //   course: 'Matemática',
    //   acronym: '',
    //   social: {
    //     facebook: '',
    //     instagram: '',
    //   },
    // },
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
