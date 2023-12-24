import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

@Component({
    selector: 'app-manual-presidente-prudente',
    templateUrl: './manual-presidente-prudente.component.html',
    styleUrls: ['./manual-presidente-prudente.component.scss', '../../manual.page.scss'],
    standalone: true,
    imports: [MarkdownModule],
})
export class ManualPresidentePrudenteComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
