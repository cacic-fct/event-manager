import {
  cleanLegacyEventShortDescription,
  convertLegacyEventDescription,
} from './legacy-event-description-converter';

describe('legacy event description converter', () => {
  it('converts common HTML description formatting to Markdown', () => {
    expect(
      convertLegacyEventDescription(
        '<h2>Programação</h2><p>Uma atividade com <strong>destaque</strong> e <a href="https://example.com">mais detalhes</a>.</p><ul><li>Primeiro</li><li>Segundo</li></ul>',
      ),
    ).toBe(
      'Programação\n-----------\n\nUma atividade com **destaque** e [mais detalhes](https://example.com).\n\n-   Primeiro\n-   Segundo',
    );
  });

  it('turns a formatted short description into one line of plain text', () => {
    expect(
      cleanLegacyEventShortDescription(
        '<p>Uma <strong>breve</strong> descrição<br>em duas linhas &amp; sem imagem <img src="private.png" alt="privada"></p>',
      ),
    ).toBe('Uma breve descrição em duas linhas & sem imagem');
  });

  it('preserves full descriptions that do not contain HTML', () => {
    const markdown = '## Programação\n\nTexto com **ênfase**.';

    expect(convertLegacyEventDescription(markdown)).toBe(markdown);
  });

  it('removes Markdown formatting from short descriptions', () => {
    expect(cleanLegacyEventShortDescription('Uma descrição **curta** com [link](https://example.com).')).toBe(
      'Uma descrição curta com link.',
    );
    expect(cleanLegacyEventShortDescription('- Primeiro\n- Segundo')).toBe('Primeiro Segundo');
  });

  it('decodes standalone HTML entities while preserving null', () => {
    expect(convertLegacyEventDescription('Pesquisa &amp; extensão')).toBe('Pesquisa & extensão');
    expect(cleanLegacyEventShortDescription('Pesquisa&nbsp;&amp;&nbsp;extensão')).toBe(
      'Pesquisa & extensão',
    );
    expect(convertLegacyEventDescription(null)).toBeNull();
    expect(cleanLegacyEventShortDescription(null)).toBeNull();
  });

  it('drops non-content HTML elements from descriptions', () => {
    expect(
      convertLegacyEventDescription(
        '<p>Conteúdo público.</p><script>tokenPrivado()</script><style>.hidden { display: none; }</style>',
      ),
    ).toBe('Conteúdo público.');
  });

  it('does not reinterpret Markdown code or autolinks as legacy HTML', () => {
    const markdown =
      'Veja <https://example.com>.\n\n```html\n<strong>Exemplo</strong>\n```\n\nUse `<em>texto</em>`.';

    expect(convertLegacyEventDescription(markdown)).toBe(markdown);
    expect(convertLegacyEventDescription(convertLegacyEventDescription(markdown))).toBe(markdown);
  });
});
