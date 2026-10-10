import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { ValuePropositionComponent } from '../value-proposition';
import { CertificateDemoComponent } from './certificate-demo';
import { MajorEventSubscriptionDemoComponent } from './major-event-subscription-demo';
import { PrizeDrawDemoComponent } from './prize-draw-demo';
import { SportsDemoComponent } from './sports-demo';

describe('landing showcase ARIA', () => {
  afterEach(() => {
    delete document.documentElement.dataset['storybookMotion'];
  });

  for (const component of [
    ValuePropositionComponent,
    CertificateDemoComponent,
    MajorEventSubscriptionDemoComponent,
    PrizeDrawDemoComponent,
    SportsDemoComponent,
  ] as Type<unknown>[]) {
    it(`uses valid ARIA roles, attributes and references in ${component.name}`, async () => {
      document.documentElement.dataset['storybookMotion'] = 'reduced';
      await TestBed.configureTestingModule({ imports: [component] }).compileComponents();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;

      const results = await axe.run(element, {
        runOnly: {
          type: 'rule',
          values: ['aria-allowed-attr', 'aria-prohibited-attr', 'aria-valid-attr-value', 'aria-valid-attr'],
        },
      });
      expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);

      for (const control of element.querySelectorAll('[aria-labelledby], [aria-controls]')) {
        for (const attribute of ['aria-labelledby', 'aria-controls']) {
          const references = control.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ?? [];
          for (const id of references) {
            expect(element.ownerDocument.getElementById(id), `${attribute} references missing ID ${id}`).not.toBeNull();
          }
        }
      }
    });
  }
});
