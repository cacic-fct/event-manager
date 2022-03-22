import { Component, OnInit } from '@angular/core';

import { Glossario } from 'src/assets/manual-do-calouro/sections/glossario.service';

@Component({
  selector: 'app-manual-glossario',
  templateUrl: './manual-glossario.component.html',
  styleUrls: [
    './manual-glossario.component.scss',
    '../../page-manual-calouro.page.scss',
  ],
})
export class ManualGlossarioComponent implements OnInit {
  dictionary = Glossario.glossary;

  constructor() {}

  ngOnInit() {
    this.dictionary.sort((a, b) => (a.term > b.term ? 1 : -1));
  }
}
