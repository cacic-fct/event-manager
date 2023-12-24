import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

@Component({
    selector: 'app-manual-introducao',
    templateUrl: './manual-introducao.component.html',
    styleUrls: ['./manual-introducao.component.scss', '../../manual.page.scss'],
    standalone: true,
    imports: [MarkdownModule],
})
export class ManualIntroducaoComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
