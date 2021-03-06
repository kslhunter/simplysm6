import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from "@angular/core";
import { SdSystemConfigRootProvider } from "../root-providers/SdSystemConfigRootProvider";
import { SdInputValidate } from "../decorators/SdInputValidate";
import { ObjectUtil } from "@simplysm/sd-core-common";
import { SdToastProvider } from "../providers/SdToastProvider";

@Component({
  selector: "sd-state-preset",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sd-anchor (click)="onAddButtonClick()">
      <sd-icon icon="star" class="sd-text-color-warning-default" fixedWidth></sd-icon>
    </sd-anchor>
    <sd-gap width="sm"></sd-gap>
    <ng-container *ngFor="let preset of presets; trackBy: trackByNameFn">
      <div>
        <sd-anchor (click)="onItemClick(preset)"
                   class="sd-text-brightness-default">
          {{ preset.name }}
        </sd-anchor>
        <sd-anchor (click)="onSaveButtonClick(preset)">
          <sd-icon icon="save" size="sm"></sd-icon>
        </sd-anchor>
        <sd-anchor (click)="onRemoveButtonClick(preset)">
          <sd-icon icon="times" size="sm"></sd-icon>
        </sd-anchor>
      </div>
      <sd-gap width="sm"></sd-gap>
    </ng-container>
  `,
  styles: [/* language=SCSS */ `
    :host {
      display: inline-block;
      vertical-align: top;

      > sd-anchor {
        display: inline-block;
        vertical-align: top;
        line-height: var(--line-height);
        border: 1px solid transparent;
        padding: var(--gap-sm) var(--gap-default);
      }

      > div {
        display: inline-block;
        vertical-align: top;
        line-height: var(--line-height);
        border: 1px solid transparent;
        padding: var(--gap-sm) var(--gap-default);

        background: var(--theme-color-grey-lightest);
        border-radius: 4px;

        &:hover {
          background: var(--theme-color-grey-lighter);
        }

        > sd-anchor {
          padding: 0 var(--gap-sm);
        }
      }

      &[sd-size=sm] {
        > sd-anchor,
        > div {
          padding: var(--gap-xs) var(--gap-default);
        }
      }

      &[sd-size=lg] {
        > sd-anchor,
        > div {
          padding: var(--gap-default) var(--gap-lg);
        }
      }
    }
  `]
})
export class SdStatePresetControl implements OnInit, OnChanges {
  @Input()
  @SdInputValidate(String)
  public key?: string;

  @Input()
  public state?: any;

  @Output()
  public readonly stateChange = new EventEmitter<any>();

  @Input()
  @SdInputValidate({
    type: String,
    includes: ["sm", "lg"]
  })
  @HostBinding("attr.sd-size")
  public size?: "sm" | "lg";


  public presets: ISdStatePresetVM[] = [];

  public trackByNameFn = (i: number, item: ISdStatePresetVM): string => item.name;

  public constructor(private readonly _systemConfig: SdSystemConfigRootProvider,
                     private readonly _cdr: ChangeDetectorRef,
                     private readonly _toast: SdToastProvider) {
  }

  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if ("key" in changes && this.key !== undefined) {
      this.presets = (await this._systemConfig.getAsync(`sd-state-preset.${this.key}`)) ?? [];
      this._cdr.markForCheck();
    }
  }

  public async ngOnInit(): Promise<void> {
    if (this.key !== undefined) {
      this.presets = (await this._systemConfig.getAsync(`sd-state-preset.${this.key}`)) ?? [];
      this._cdr.markForCheck();
    }
  }

  public async onAddButtonClick(): Promise<void> {
    const newName = prompt("?????? ????????? ???????????????.");
    if (newName == null) return;

    this.presets.push({
      name: newName,
      state: ObjectUtil.clone(this.state)
    });
    if (this.key !== undefined) {
      await this._systemConfig.setAsync(`sd-state-preset.${this.key}`, this.presets);
    }

    this._toast.info(`?????? ????????? ${newName}??? ?????????????????????.`);
  }

  public onItemClick(preset: ISdStatePresetVM): void {
    if (!ObjectUtil.equal(this.state, preset.state)) {
      if (this.stateChange.observers.length > 0) {
        this.stateChange.emit(ObjectUtil.clone(preset.state));
      }
      else {
        this.state = preset.state;
      }
    }
  }

  public async onRemoveButtonClick(preset: ISdStatePresetVM): Promise<void> {
    if (!confirm("????????? '" + preset.name + "'????????? ???????????????.")) return;

    this.presets.remove(preset);
    if (this.key !== undefined) {
      await this._systemConfig.setAsync(`sd-state-preset.${this.key}`, this.presets);
    }
  }

  public async onSaveButtonClick(preset: ISdStatePresetVM): Promise<void> {
    preset.state = ObjectUtil.clone(this.state);
    if (this.key !== undefined) {
      await this._systemConfig.setAsync(`sd-state-preset.${this.key}`, this.presets);
    }

    this._toast.info(`?????? ????????? ${preset.name}??? ?????????????????????.`);
  }
}

export interface ISdStatePresetVM {
  name: string;
  state: any;
}