import { Component, OnInit } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

@Component({
    selector: 'app-manual-auxilios',
    templateUrl: './manual-auxilios.component.html',
    styleUrls: ['./manual-auxilios.component.scss', '../../manual.page.scss'],
    standalone: true,
    imports: [MarkdownModule],
})
export class ManualAuxiliosComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
