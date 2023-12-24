import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

import { Glossario } from 'src/assets/manual-do-calouro/sections/glossario.service';

@Component({
  selector: 'app-manual-glossario',
  templateUrl: './manual-glossario.component.html',
  styleUrls: ['./manual-glossario.component.scss', '../../manual.page.scss'],
  standalone: true,
  imports: [MarkdownModule],
})
export class ManualGlossarioComponent implements OnInit {
  dictionary = Glossario.glossary;

  constructor() {}

  ngOnInit() {
    this.dictionary.sort((a, b) => (a.term > b.term ? 1 : -1));
  }
}
