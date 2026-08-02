import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class DocumentSeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  setTitle(value: string): void {
    this.title.setTitle(value);
  }

  setNameMeta(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name='${name}'`);
  }

  removeNameMeta(name: string): void {
    this.meta.removeTag(`name='${name}'`);
  }

  setPropertyMeta(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property='${property}'`);
  }

  removePropertyMeta(property: string): void {
    this.meta.removeTag(`property='${property}'`);
  }

  setCanonicalUrl(url: string): void {
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url;
  }

  removeCanonicalUrl(): void {
    this.document.head.querySelector('link[rel="canonical"]')?.remove();
  }

  setJsonLd(id: string, data: unknown): void {
    let script = this.document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.replaceChildren(this.document.createTextNode(JSON.stringify(data)));
  }

  removeJsonLd(id: string): void {
    this.document.getElementById(id)?.remove();
  }
}
