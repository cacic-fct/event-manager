import React, { useRef } from 'react';
import Mermaid from '@theme/Mermaid';

type Props = {
  value: string;
};

function getSerializedSvg(container: HTMLDivElement | null): string | undefined {
  const svg = container?.querySelector('svg');

  if (!svg) {
    return undefined;
  }

  const clonedSvg = svg.cloneNode(true) as SVGElement;
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return new XMLSerializer().serializeToString(clonedSvg);
}

function createSvgObjectUrl(svgText: string): string {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });

  return URL.createObjectURL(blob);
}

export default function MermaidWithActions({ value }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  function openSvgInNewTab() {
    const svgText = getSerializedSvg(containerRef.current);

    if (!svgText) {
      return;
    }

    const url = createSvgObjectUrl(svgText);
    window.open(url, '_blank', 'noopener,noreferrer');

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadSvg() {
    const svgText = getSerializedSvg(containerRef.current);

    if (!svgText) {
      return;
    }

    const url = createSvgObjectUrl(svgText);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'esquema-banco-de-dados.svg';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="mermaidWithActions">
      <div className="mermaidWithActions__toolbar">
        <button className="button button--secondary button--sm" type="button" onClick={openSvgInNewTab}>
          Abrir diagrama em nova aba
        </button>
        <button className="button button--secondary button--sm" type="button" onClick={downloadSvg}>
          Baixar SVG
        </button>
      </div>

      <div ref={containerRef} className="mermaidWithActions__diagram">
        <Mermaid value={value} />
      </div>
    </div>
  );
}
