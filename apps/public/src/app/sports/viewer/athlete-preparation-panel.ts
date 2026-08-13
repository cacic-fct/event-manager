import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { SportsViewerApiService } from './sports-viewer-api.service';
import type { SportsAthleteProfile } from './sports-viewer.types';

@Component({
  selector: 'app-sports-athlete-preparation-panel',
  imports: [
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    TwemojiComponent,
  ],
  templateUrl: './athlete-preparation-panel.html',
  styleUrl: './athlete-preparation-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsAthletePreparationPanel {
  private readonly api = inject(SportsViewerApiService);
  private readonly snackbar = inject(MatSnackBar);

  readonly profiles = input.required<SportsAthleteProfile[]>();
  readonly savingId = signal<string | null>(null);
  readonly gameAccountProfiles = computed(() =>
    this.profiles().filter((profile) => profile.athleteIdentifierMode === 'GAME_ACCOUNT'),
  );

  private readonly forms = new Map<string, FormGroup<{
    gameNickname: FormControl<string>;
    gameAccountName: FormControl<string>;
    gameAccountUrl: FormControl<string>;
  }>>();

  formFor(profile: SportsAthleteProfile) {
    const existing = this.forms.get(profile.registrationMemberId);
    if (existing) {
      return existing;
    }
    const form = new FormGroup({
      gameNickname: new FormControl(profile.gameNickname ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(80)],
      }),
      gameAccountName: new FormControl(profile.gameAccountName ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(160)],
      }),
      gameAccountUrl: new FormControl(profile.gameAccountUrl ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(2_048), Validators.pattern(/^https:\/\/.+/i)],
      }),
    });
    this.forms.set(profile.registrationMemberId, form);
    return form;
  }

  async save(profile: SportsAthleteProfile): Promise<void> {
    const form = this.formFor(profile);
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    this.savingId.set(profile.registrationMemberId);
    try {
      const value = form.getRawValue();
      await firstValueFrom(
        this.api.updateAthleteProfile({
          registrationMemberId: profile.registrationMemberId,
          gameNickname: value.gameNickname.trim(),
          gameAccountName: value.gameAccountName.trim(),
          gameAccountUrl: value.gameAccountUrl.trim() || null,
        }),
      );
      form.markAsPristine();
      this.snackbar.open('Identificação atualizada.', 'Fechar', { duration: 3500 });
    } catch (error: unknown) {
      this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível salvar sua identificação.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.savingId.set(null);
    }
  }
}
