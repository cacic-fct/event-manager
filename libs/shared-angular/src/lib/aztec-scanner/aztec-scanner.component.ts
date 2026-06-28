import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { readBarcodes, ReadInputBarcodeFormat } from 'zxing-wasm';
import { ScannerSoundsService } from './scanner-sounds.service';

type ScannerState =
  | 'idle'
  | 'requesting-permission'
  | 'scanning'
  | 'paused'
  | 'permission-denied'
  | 'no-camera'
  | 'error';

interface ScreenWakeLockSentinel extends EventTarget {
  release(): Promise<void>;
}

interface ScreenWakeLockNavigator {
  wakeLock?: {
    request(type: 'screen'): Promise<ScreenWakeLockSentinel>;
  };
}

@Component({
  selector: 'lib-aztec-scanner',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <section class="scanner-shell">
      <div class="video-frame">
        <video #scannerVideo muted playsinline></video>

        @if (isBusy()) {
          <mat-progress-bar mode="indeterminate" />
        }
      </div>

      <div class="scanner-controls">
        <div>
          <p class="scanner-title">{{ title() }}</p>
          <p class="scanner-status" aria-live="polite">
            {{ statusText() }}
          </p>
        </div>

        <button
          matIconButton
          type="button"
          matTooltip="Trocar câmera"
          [disabled]="devices().length < 2 || isBusy()"
          (click)="selectNextDevice()">
          <mat-icon>cameraswitch</mat-icon>
        </button>
      </div>
    </section>
  `,
  styles: `
    .scanner-shell {
      display: grid;
      gap: 16px;
      min-width: min(480px, 82vw);
    }

    .video-frame {
      aspect-ratio: 1;
      background: #000;
      border-radius: 8px;
      display: grid;
      overflow: hidden;
      position: relative;
    }

    video {
      display: block;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    mat-progress-bar {
      bottom: 0;
      left: 0;
      position: absolute;
      right: 0;
    }

    .scanner-controls {
      align-items: center;
      display: flex;
      gap: 16px;
      justify-content: space-between;
    }

    .scanner-title {
      font: var(--mat-sys-title-medium);
      margin: 0;
    }

    .scanner-status {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      margin: 2px 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AztecScannerComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('scannerVideo');

  private readonly scannerCanvas = this.document.createElement('canvas');
  private readonly context = this.scannerCanvas.getContext('2d', {
    willReadFrequently: true,
  });

  private readonly scannerSoundsService = inject(ScannerSoundsService);

  readonly title = input('Escanear código');
  readonly acceptedPrefixes = input<readonly string[]>([]);
  readonly pauseAfterScanMs = input(1800);
  readonly frameSize = input(1280);

  readonly scan = output<string>();
  readonly permissionChange = output<boolean>();
  readonly deviceListChange = output<MediaDeviceInfo[]>();

  readonly devices = signal<MediaDeviceInfo[]>([]);
  readonly selectedDevice = signal<MediaDeviceInfo | null>(null);
  readonly state = signal<ScannerState>('idle');
  readonly errorMessage = signal('');

  readonly isBusy = computed(() => ['idle', 'requesting-permission'].includes(this.state()));

  readonly formats = input<ReadInputBarcodeFormat[]>(['Aztec']);

  readonly statusText = computed(() => {
    switch (this.state()) {
      case 'requesting-permission':
        return 'Solicitando permissão para usar a câmera.';
      case 'scanning':
        return `Aponte a câmera para o código ${[this.formats()].join(', ')}.`;
      case 'paused':
        return 'Código incompatível. Aponte para outro código.';
      case 'permission-denied':
        return 'Permissão de câmera não concedida.';
      case 'no-camera':
        return 'Nenhuma câmera foi encontrada.';
      case 'error':
        return this.errorMessage() || 'Não foi possível iniciar a câmera.';
      case 'idle':
        return 'Preparando câmera.';
    }
  });

  private animationFrameId: number | null = null;
  private pauseUntil = 0;
  private startAttemptId = 0;
  private wakeLock: ScreenWakeLockSentinel | null = null;

  private readonly handleWakeLockRelease = (): void => {
    this.wakeLock = null;
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible' && this.hasActiveStream()) {
      void this.requestWakeLock();
      return;
    }

    void this.releaseWakeLock();
  };

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    queueMicrotask(() => void this.start());
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.stop();
    });
  }

  async start(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.state.set('requesting-permission');
    this.errorMessage.set('');

    const hasPermission = await this.requestInitialPermission();
    this.permissionChange.emit(hasPermission);

    if (!hasPermission) {
      this.state.set('permission-denied');
      return;
    }

    const devices = await this.listVideoInputDevices();

    this.devices.set(devices);
    this.deviceListChange.emit(devices);

    if (devices.length === 0) {
      this.state.set('no-camera');
      return;
    }

    const preferredDevice = this.pickPreferredCamera(devices);
    await this.startWithFallback(preferredDevice);
  }

  selectNextDevice(): void {
    const devices = this.devices();

    if (devices.length < 2) {
      return;
    }

    const currentDevice = this.selectedDevice();
    const currentIndex = currentDevice ? devices.findIndex((device) => device.deviceId === currentDevice.deviceId) : -1;

    const nextDevice = devices[(currentIndex + 1) % devices.length];

    if (nextDevice) {
      void this.startWithFallback(nextDevice);
    }
  }

  private async requestInitialPermission(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      this.terminateStream(stream);
      return true;
    } catch {
      return false;
    }
  }

  private async listVideoInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  }

  private pickPreferredCamera(devices: readonly MediaDeviceInfo[]): MediaDeviceInfo {
    const rearCamera = devices.find(({ label }) => /back|trás|rear|traseira|environment|ambiente/i.test(label));

    return rearCamera ?? devices[devices.length - 1];
  }

  private async startWithFallback(firstDevice: MediaDeviceInfo): Promise<void> {
    const attemptId = ++this.startAttemptId;

    this.state.set('requesting-permission');
    this.errorMessage.set('');
    this.stopScanningLoop();
    this.stopStream();

    const candidates = this.getFallbackDeviceOrder(firstDevice);
    let lastError: unknown = null;

    for (const device of candidates) {
      if (attemptId !== this.startAttemptId) {
        return;
      }

      try {
        await this.startDevice(device);

        if (attemptId !== this.startAttemptId) {
          this.stopStream();
          return;
        }

        this.selectedDevice.set(device);
        this.state.set('scanning');
        await this.requestWakeLock();
        this.scheduleFrame();
        return;
      } catch (error) {
        lastError = error;
        this.stopStream();
      }
    }

    if (attemptId !== this.startAttemptId) {
      return;
    }

    this.selectedDevice.set(null);
    this.errorMessage.set(this.formatCameraError(lastError));
    this.state.set('error');
  }

  private getFallbackDeviceOrder(firstDevice: MediaDeviceInfo): MediaDeviceInfo[] {
    const devices = this.devices();

    return [firstDevice, ...devices.filter((device) => device.deviceId !== firstDevice.deviceId)];
  }

  private async startDevice(device: MediaDeviceInfo): Promise<void> {
    const video = this.video().nativeElement;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: device.deviceId,
        },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();
  }

  private formatCameraError(error: unknown): string {
    if (!(error instanceof DOMException)) {
      return error instanceof Error ? error.message : 'Não foi possível iniciar nenhuma câmera disponível.';
    }

    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'O navegador bloqueou o acesso às câmeras disponíveis.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'A câmera selecionada não está mais disponível.';
      case 'NotReadableError':
        return 'A câmera está em uso por outro aplicativo ou não pôde ser acessada.';
      default:
        return error.message || 'Não foi possível iniciar nenhuma câmera disponível.';
    }
  }

  private scheduleFrame(): void {
    this.stopScanningLoop();

    this.animationFrameId = requestAnimationFrame(() => void this.processFrame());
  }

  private async processFrame(): Promise<void> {
    if (this.state() !== 'scanning' && this.state() !== 'paused') {
      return;
    }

    if (Date.now() < this.pauseUntil) {
      this.scheduleFrame();
      return;
    }

    if (this.state() === 'paused') {
      this.state.set('scanning');
    }

    const video = this.video().nativeElement;

    if (!this.context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.scheduleFrame();
      return;
    }

    if (!this.resizeScannerCanvas()) {
      this.scheduleFrame();
      return;
    }

    this.context.drawImage(video, 0, 0, this.scannerCanvas.width, this.scannerCanvas.height);

    const imageData = this.context.getImageData(0, 0, this.scannerCanvas.width, this.scannerCanvas.height);
    const results = await readBarcodes(imageData, {
      formats: this.formats(),
      tryHarder: true,
      tryDownscale: true,
    });

    const result = results.find((item) => item.isValid && item.text);

    if (result?.text) {
      if (this.acceptsCode(result.text)) {
        this.scan.emit(result.text);
      } else if (this.acceptedPrefixes().length > 0) {
        this.scannerSoundsService.invalid();
      }

      this.pauseUntil = Date.now() + this.pauseAfterScanMs();
      this.state.set('paused');
    }

    this.scheduleFrame();
  }

  private resizeScannerCanvas(): boolean {
    const video = this.video().nativeElement;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }

    if (this.scannerCanvas.width !== video.videoWidth || this.scannerCanvas.height !== video.videoHeight) {
      this.scannerCanvas.width = video.videoWidth;
      this.scannerCanvas.height = video.videoHeight;
    }

    return true;
  }

  private acceptsCode(code: string): boolean {
    const acceptedPrefixes = this.acceptedPrefixes();

    return acceptedPrefixes.length === 0 || acceptedPrefixes.some((prefix) => code.startsWith(prefix));
  }

  private stop(): void {
    this.startAttemptId++;
    this.stopScanningLoop();
    this.stopStream();
  }

  private stopScanningLoop(): void {
    if (this.animationFrameId === null) {
      return;
    }

    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private stopStream(): void {
    const video = this.video().nativeElement;

    this.terminateStream(video.srcObject instanceof MediaStream ? video.srcObject : null);
    void this.releaseWakeLock();

    video.srcObject = null;
  }

  private terminateStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
  }

  private async requestWakeLock(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.document.visibilityState !== 'visible' || this.wakeLock) {
      return;
    }

    const wakeLock = (navigator as unknown as ScreenWakeLockNavigator).wakeLock;

    if (!wakeLock) {
      return;
    }

    try {
      this.wakeLock = await wakeLock.request('screen');
      this.wakeLock?.addEventListener('release', this.handleWakeLockRelease);
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const wakeLock = this.wakeLock;

    if (!wakeLock) {
      return;
    }

    this.wakeLock = null;
    wakeLock.removeEventListener('release', this.handleWakeLockRelease);

    try {
      await wakeLock.release();
    } catch {
      // Wake Lock is best-effort and must not block scanner teardown.
    }
  }

  private hasActiveStream(): boolean {
    const stream = this.video().nativeElement.srcObject;

    return stream instanceof MediaStream && stream.getVideoTracks().some((track) => track.readyState === 'live');
  }
}
