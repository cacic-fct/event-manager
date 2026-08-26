import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  PrizeDrawConfettiDensity,
  resolvePrizeDrawConfettiDensity,
} from './prize-draw-confetti-density';

type ConfettiParticle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
};

type PreparedCanvas = {
  context: CanvasRenderingContext2D;
  bounds: DOMRect;
  colors: string[];
};

@Component({
  selector: 'app-prize-draw-confetti',
  template: `
    <span class="color-probes" aria-hidden="true">
      <span #colorProbe class="primary"></span>
      <span #colorProbe class="secondary"></span>
      <span #colorProbe class="tertiary"></span>
      <span #colorProbe class="primary-container"></span>
      <span #colorProbe class="tertiary-container"></span>
    </span>
    <canvas #canvas aria-hidden="true"></canvas>
  `,
  styles: `
    :host, canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .color-probes { position: absolute; width: 0; height: 0; overflow: hidden; }
    .primary { color: var(--mat-sys-primary); }
    .secondary { color: var(--mat-sys-secondary); }
    .tertiary { color: var(--mat-sys-tertiary); }
    .primary-container { color: var(--mat-sys-primary-container); }
    .tertiary-container { color: var(--mat-sys-tertiary-container); }
  `,
})
export class PrizeDrawConfettiComponent implements AfterViewInit, OnDestroy {
  readonly reducedMotion = input(false);
  readonly particleCount = input(110);
  readonly durationMs = input(2400);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly colorProbes = viewChildren<ElementRef<HTMLElement>>('colorProbe');
  private frameId: number | null = null;
  private viewReady = false;

  constructor() {
    effect(() => {
      this.reducedMotion();
      this.particleCount();
      this.durationMs();
      if (this.viewReady) queueMicrotask(() => this.restart());
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.restart();
  }

  ngOnDestroy(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
  }

  restart(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    const prepared = this.prepareCanvas();
    if (!prepared) return;
    const density = resolvePrizeDrawConfettiDensity(this.particleCount());
    if (this.reducedMotion()) {
      this.drawStaticPattern(prepared, Math.min(density.particleCount, 96));
      return;
    }
    this.burst(prepared, density);
  }

  private prepareCanvas(): PreparedCanvas | null {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.scale(ratio, ratio);
    const colors = this.colorProbes()
      .map((probe) => getComputedStyle(probe.nativeElement).color)
      .filter(Boolean);
    return colors.length > 0 ? { context, bounds, colors } : null;
  }

  private burst(prepared: PreparedCanvas, density: PrizeDrawConfettiDensity): void {
    const { context, bounds, colors } = prepared;
    const particles: ConfettiParticle[] = Array.from({ length: density.particleCount }, (_, index) => {
      const angle = -Math.PI * (0.18 + Math.random() * 0.64);
      const speed = density.easterEgg ? 7 + Math.random() * 11 : 5 + Math.random() * 8;
      return {
        x: density.easterEgg
          ? Math.random() * bounds.width
          : bounds.width / 2 + (Math.random() - 0.5) * 24,
        y: density.easterEgg
          ? bounds.height * (0.16 + Math.random() * 0.46)
          : bounds.height * 0.54,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed - 3,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        width: 5 + Math.random() * 5,
        height: 3 + Math.random() * 4,
        color: colors[index % colors.length],
      };
    });
    const startedAt = performance.now();
    const duration = density.easterEgg
      ? Math.max(4200, Math.min(this.durationMs(), 5000))
      : Math.min(Math.max(this.durationMs(), 400), 5000);
    const draw = (now: number) => {
      const elapsed = now - startedAt;
      context.clearRect(0, 0, bounds.width, bounds.height);
      for (const particle of particles) {
        particle.velocityY += 0.19;
        particle.velocityX *= 0.992;
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.rotation += particle.rotationSpeed;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
        context.restore();
      }
      if (elapsed < duration) this.frameId = requestAnimationFrame(draw);
      else this.frameId = null;
    };
    this.frameId = requestAnimationFrame(draw);
  }

  private drawStaticPattern(prepared: PreparedCanvas, particleCount: number): void {
    const { context, bounds, colors } = prepared;
    context.globalAlpha = 0.78;
    for (let index = 0; index < particleCount; index += 1) {
      const edge = index % 4;
      const horizontal = Math.random() * bounds.width;
      const vertical = Math.random() * bounds.height;
      const x = edge === 0 || edge === 2
        ? horizontal
        : bounds.width * (edge === 1 ? 0.06 + Math.random() * 0.12 : 0.82 + Math.random() * 0.12);
      const y = edge === 1 || edge === 3
        ? vertical
        : bounds.height * (edge === 0 ? 0.05 + Math.random() * 0.14 : 0.81 + Math.random() * 0.14);
      context.save();
      context.translate(x, y);
      context.rotate(Math.random() * Math.PI);
      context.fillStyle = colors[index % colors.length];
      context.fillRect(-3 - Math.random() * 2, -2, 6 + Math.random() * 5, 3 + Math.random() * 3);
      context.restore();
    }
    context.globalAlpha = 1;
  }
}
