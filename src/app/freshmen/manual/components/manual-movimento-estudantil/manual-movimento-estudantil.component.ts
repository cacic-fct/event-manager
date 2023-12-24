import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

@Component({
    selector: 'app-manual-movimento-estudantil',
    templateUrl: './manual-movimento-estudantil.component.html',
    styleUrls: ['./manual-movimento-estudantil.component.scss', '../../manual.page.scss'],
    standalone: true,
    imports: [MarkdownModule],
})
export class ManualMovimentoEstudantilComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
