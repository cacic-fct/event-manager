import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { createAdminEventFormResults } from '../../../testing/admin-entity-fixtures';
import { FormResultsComponent } from './form-results.component';

const echartsMock = vi.hoisted(() => ({
  init: vi.fn((element: HTMLElement) => ({
    dispose: vi.fn(),
    getDom: () => element,
    resize: vi.fn(),
    setOption: vi.fn(),
  })),
}));

vi.mock('echarts', () => echartsMock);

describe('FormResultsComponent', () => {
  let chartWidth = 320;
  let chartHeight = 220;
  let resizeCallbacks: Array<() => void> = [];
  let originalClientWidth: PropertyDescriptor | undefined;
  let originalClientHeight: PropertyDescriptor | undefined;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(async () => {
    echartsMock.init.mockClear();
    resizeCallbacks = [];
    chartWidth = 320;
    chartHeight = 220;
    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.classList.contains('chart') ? chartWidth : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.classList.contains('chart') ? chartHeight : 0;
      },
    });
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }

      observe(): void {
        return;
      }

      unobserve(): void {
        return;
      }

      disconnect(): void {
        return;
      }
    } as unknown as typeof ResizeObserver;

    await TestBed.configureTestingModule({
      imports: [FormResultsComponent],
    }).compileComponents();
  });

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    }
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('renders choice summaries as charts with readable answer counts', () => {
    const fixture = TestBed.createComponent(FormResultsComponent);
    fixture.componentRef.setInput('results', choiceResults());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const chart = element.querySelector<HTMLElement>('.chart');

    expect(chart?.getAttribute('aria-label')).toBe('Você irá participar do coffee break? Sim: 1');
    expect(element.textContent).toContain('Você irá participar do coffee break?');
    expect(element.textContent).toContain('1 resposta');
    expect(element.textContent).toContain('Sim');
    expect(echartsMock.init).toHaveBeenCalledTimes(1);
  });

  it('waits for hidden chart containers to receive dimensions before creating ECharts instances', () => {
    chartWidth = 0;
    chartHeight = 0;
    const fixture = TestBed.createComponent(FormResultsComponent);
    fixture.componentRef.setInput('results', choiceResults());
    fixture.detectChanges();

    expect(echartsMock.init).not.toHaveBeenCalled();

    chartWidth = 320;
    chartHeight = 220;
    resizeCallbacks.forEach((callback) => callback());

    expect(echartsMock.init).toHaveBeenCalledTimes(1);
  });
});

function choiceResults() {
  return createAdminEventFormResults({
    responseCount: 1,
    summaryJson: JSON.stringify({
      questions: [
        {
          elementId: 'coffee-break',
          title: 'Você irá participar do coffee break?',
          type: 'singleChoice',
          answeredCount: 1,
          buckets: [{ label: 'Sim', value: 1 }],
          textAnswers: [],
        },
      ],
    }),
  });
}

