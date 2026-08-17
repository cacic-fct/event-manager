import { readEChartsThemeColor } from './echarts-theme-colors';

describe('readEChartsThemeColor', () => {
  it('never forwards unresolved Material light-dark tokens to ECharts', () => {
    const element = document.createElement('div');
    element.style.setProperty('--chart-color', 'light-dark(#7d00fa, #d5baff)');
    document.body.appendChild(element);

    const color = readEChartsThemeColor(element, '--chart-color', '#415f91');

    expect(color).not.toContain('light-dark(');
    expect(color).toBe('#415f91');
    element.remove();
  });

  it('resolves supported CSS colors through the chart document', () => {
    const element = document.createElement('div');
    element.style.setProperty('--chart-color', '#7d00fa');
    document.body.appendChild(element);

    expect(readEChartsThemeColor(element, '--chart-color', '#415f91')).toBe('rgb(125, 0, 250)');
    element.remove();
  });
});
