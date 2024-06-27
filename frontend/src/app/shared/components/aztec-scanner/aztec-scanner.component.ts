/*
 * This component has several snippets from @zxing-js/ngx-scanner and @zxing-js/browser
 */
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

import { hasNavigator, canEnumerateDevices } from './services/navigator-utils.service';
import { ReadResult, readBarcodesFromImageData } from 'zxing-wasm';

@Component({
  selector: 'app-aztec-scanner',
  templateUrl: './aztec-scanner.component.html',
  styleUrls: ['./aztec-scanner.component.scss'],
  standalone: true,
})
export class AztecScannerComponent implements AfterViewInit {
  isAutostarting = false;

  scannerCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  @Output() deviceList = new EventEmitter<MediaDeviceInfo[]>();
  @Output() noCamerasFound = new EventEmitter<void>();
  @Output() hasPermission = new EventEmitter<boolean>(false);
  @Output() scanSuccess = new EventEmitter<string>();

  @Input() delaySeconds = 1;

  @ViewChild('scannerVideo') videoElemRef!: ElementRef<HTMLVideoElement>;

  _hasPermission = false;

  /**
   * The device that should be used to scan things.
   */
  private _device: MediaDeviceInfo | undefined;

  /**
   * User device input
   */
  @Input({ required: true })
  set device(device: MediaDeviceInfo | undefined) {
    // if (!this._ready) {
    //   this._devicePreStart = device;
    //   // let's ignore silently, users don't like logs
    //   return;
    // }

    if (this.isAutostarting) {
      // do not allow setting devices during auto-start, since it will set one and emit it.
      console.warn('Avoid setting a device during auto-start.');
      return;
    }

    if (this.isCurrentDevice(device)) {
      console.warn('Setting the same device is not allowed.');
      return;
    }

    if (!this._hasPermission) {
      console.warn('Permissions not set yet, waiting for them to be set to apply device change.');
      // this.permissionResponse
      //   .pipe(
      //     take(1),
      //     tap(() => console.log(`Permissions set, applying device change${device ? ` (${device.deviceId})` : ''}.`))
      //   )
      //   .subscribe(() => this.device = device);
      return;
    }

    if (device) {
      this.setDevice(device);
    }
  }

  constructor() {
    this.scannerCanvas = document.createElement('canvas');
    const canvas = this.scannerCanvas;
    canvas.width = 400;
    canvas.height = 400;
    this.ctx = canvas.getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
  }

  ngAfterViewInit() {
    this.autoStart();
  }

  async autoStart() {
    this.isAutostarting = true;

    const video = this.videoElemRef.nativeElement;

    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    try {
      // Asks for permission before enumerating devices so it can get all the device's info
      this._hasPermission = await this.askForPermission();
    } catch (e) {
      console.error('Exception occurred while asking for permission:', e);
      return;
    }

    if (!this._hasPermission) {
      console.error('Permission denied by the user.');
      return;
    }

    this.hasPermission.next(true);

    const devices = await this.listVideoInputDevices();

    const hasDevices = devices?.length > 0;

    if (!hasDevices) {
      this.noCamerasFound.next();
      console.error('No cameras found.');
      return;
    }
    this.isAutostarting = false;

    this.autoSelectRearCamera(devices);

    this.deviceList.next(devices);
  }

  async autoSelectRearCamera(devices: MediaDeviceInfo[]) {
    const matcher = ({ label }: { label: string }) => /back|trás|rear|traseira|environment|ambiente/gi.test(label);

    // select the rear camera by default, otherwise take the last camera.
    const device = devices.find(matcher) || devices.slice().pop();

    if (!device) {
      throw new Error('Impossible to autostart, no input devices available.');
    }

    await this.setDevice(device);
  }

  /**
   * Lists all the available video input devices.
   */
  public async listVideoInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!hasNavigator()) {
      throw new Error("Can't enumerate devices, navigator is not present.");
    }

    if (!canEnumerateDevices()) {
      throw new Error("Can't enumerate devices, method not supported.");
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices: MediaDeviceInfo[] = [];

    for (const device of devices) {
      const kind = (device.kind as string) === 'video' ? 'videoinput' : device.kind;

      if (kind !== 'videoinput') {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deviceId = device.deviceId || (device as any).id;
      const label = device.label || `Video device ${videoDevices.length + 1}`;
      const groupId = device.groupId;

      const videoDevice = { deviceId, label, kind, groupId } as MediaDeviceInfo;

      videoDevices.push(videoDevice);
    }

    return videoDevices;
  }

  public async askForPermission(): Promise<boolean> {
    if (!hasNavigator()) {
      throw new Error("Can't ask for permissions, navigator is not present.");
    }

    if (!canEnumerateDevices()) {
      throw new Error("Can't ask for permissions, method not supported.");
    }

    let stream: MediaStream | undefined;
    let permission = false;

    try {
      // Will try to ask for permission
      stream = await this.getAnyVideoDevice();

      permission = !!stream;
    } catch (error) {
      console.error('Error getting permission:', error);
      if (stream) {
        this.terminateStream(stream);
      }

      return permission;
    } finally {
      if (stream) {
        this.terminateStream(stream);
      }
      // eslint-disable-next-line no-unsafe-finally
      return permission;
    }
  }

  /**
   * Terminates a stream and it's tracks.
   */
  private terminateStream(stream: MediaStream | undefined) {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = undefined;
    }
  }

  /**
   *
   */
  getAnyVideoDevice(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ video: true });
  }

  /**
   * Sets the current device.
   */
  private async setDevice(device: MediaDeviceInfo): Promise<void> {
    // instantly stops the scan before changing devices
    // this.scanStop();

    // correctly sets the new (or none) device
    this._device = device || undefined;

    if (!this._device) {
      // cleans the video because user removed the device
      this.cleanVideoSource(this.videoElemRef.nativeElement);
    }

    if (device) {
      await this.scanFromDevice(device.deviceId);
    }
  }

  async scanFromDevice(deviceId: string) {
    const video = this.videoElemRef.nativeElement;

    this.cleanVideoSource(video);

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceId }, audio: false })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
        this.processFrame(this.delaySeconds * 1000);
      })
      .catch(function (error) {
        console.error('Error accessing camera:', error);
      });
  }

  async processFrame(delay: number) {
    const video = this.videoElemRef.nativeElement;
    const canvas = this.scannerCanvas;
    const ctx = this.ctx;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);

    if (!imageData) {
      console.error('No image data found.');
      return;
    }

    const imageDataReadResults: ReadResult[] = await readBarcodesFromImageData(imageData, {
      tryHarder: true,
      tryDownscale: true,
    });

    let result = false;

    if (imageDataReadResults.length > 0) {
      result = imageDataReadResults[0].isValid;

      if (result) {
        this.scanSuccess.next(imageDataReadResults[0].text);
      }
    }

    const timeout = !result ? 0 : delay;
    setTimeout(
      () => requestAnimationFrame(this.processFrame.bind(this, delay)), // Bind the processFrame method to the current instance of the class.
      timeout
    );
  }

  /**
   * Checks if the given device is the current defined one.
   */
  isCurrentDevice(device?: MediaDeviceInfo) {
    return device?.deviceId === this._device?.deviceId;
  }

  cleanVideoSource(video: HTMLVideoElement) {
    if (video.srcObject) {
      const stream = video.srcObject as MediaStream;
      const tracks = stream.getTracks();

      tracks.forEach((track) => track.stop());

      video.srcObject = null;
    }
  }
}
