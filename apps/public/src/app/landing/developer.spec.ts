import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Developer } from './developer';

describe('Developer', () => {
  let component: Developer;
  let fixture: ComponentFixture<Developer>;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    snackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Developer],
    })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();

    fixture = TestBed.createComponent(Developer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('syntax highlights the API examples', () => {
    fixture.detectChanges();

    const queryCode = fixture.nativeElement.querySelector('code.language-graphql');
    const curlCode = fixture.nativeElement.querySelector('code.language-bash');

    expect(queryCode).not.toBeNull();
    expect(queryCode?.classList.contains('hljs')).toBe(true);
    expect(queryCode?.innerHTML).toContain('<span class="hljs-keyword">query</span>');
    expect(curlCode).not.toBeNull();
    expect(curlCode?.classList.contains('hljs')).toBe(true);
    expect(curlCode?.innerHTML).toContain('<span class="hljs-string">');
  });

  it('copies the public curl example', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await component.copyPublicApiCurl();

    expect(writeText).toHaveBeenCalledWith(component.publicApiCurl);
    expect(component.curlCopied()).toBe(true);
    expect(snackBar.open).toHaveBeenCalledWith('Exemplo em curl copiado.', 'OK', { duration: 3000 });
  });
});
