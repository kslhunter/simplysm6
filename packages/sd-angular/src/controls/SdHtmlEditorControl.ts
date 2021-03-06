import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  Output,
  ViewChild
} from "@angular/core";
import { SdInputValidate } from "../decorators/SdInputValidate";

@Component({
  selector: "sd-html-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sd-dock-container>
      <sd-dock class="_toolbar" *ngIf="!disabled">
        <sd-anchor (click)="viewState = 'preview'" [class._selected]="viewState === 'preview'">
          <sd-icon [icon]="'eye'" fw></sd-icon>
        </sd-anchor>
        <sd-anchor (click)="viewState = 'edit'" [class._selected]="viewState === 'edit'">
          <sd-icon [icon]="'pen'" fw></sd-icon>
        </sd-anchor>
        <sd-anchor (click)="viewState = 'code'" [class._selected]="viewState === 'code'">
          <sd-icon [icon]="'code'" fw></sd-icon>
        </sd-anchor>
        <ng-container *ngIf="rowsButton && !inset && viewState === 'code'">
          |
          <sd-anchor (click)="rows = rows + 1">
            <sd-icon [icon]="'plus'" fw></sd-icon>
          </sd-anchor>
          <sd-anchor (click)="rows = rows - 1" *ngIf="rows > 1">
            <sd-icon [icon]="'minus'" fw></sd-icon>
          </sd-anchor>
        </ng-container>
      </sd-dock>

      <sd-pane>
        <div #editor *ngIf="viewState !== 'code' || disabled"
             [attr.contenteditable]="viewState === 'edit' && !disabled"
             (input)="onContentInput($event)"></div>
        <textarea *ngIf="viewState === 'code' && !disabled"
                  [value]="value || ''"
                  [rows]="inset ? undefined : rows"
                  [style.resize]="inset ? 'none' : resize"
                  (input)="onTextareaInput($event)"
                  wrap="off"></textarea>
      </sd-pane>
    </sd-dock-container>`,
  styles: [/* language=SCSS */ `
    @import "../../scss/mixins";

    :host {
      display: block;
      border: 1px solid var(--trans-brightness-default);

      /deep/ > sd-dock-container {
        > ._toolbar {
          > div {
            user-select: none;

            > sd-anchor {
              display: inline-block;
              padding: var(--gap-sm) 0;
              text-align: center;
              width: calc(var(--gap-sm) * 2 + var(--font-size-default) * var(--line-height-strip-unit));

              &:hover {
                background: rgba(0, 0, 0, .05);
              }

              &._selected {
                background: var(--theme-color-primary-default);
                color: var(--text-brightness-rev-default);
              }
            }
          }
        }

        > sd-pane {
          > div {
            @include form-control-base();
            height: 100%;

            &[contenteditable=true] {
              cursor: text;
              background: var(--theme-color-secondary-lightest);
            }
          }

          > textarea {
            @include form-control-base();
            height: 100%;
            background: var(--theme-color-info-lightest);
            border: none;
            transition: outline-color .1s linear;
            outline: 1px solid transparent;
            outline-offset: -1px;

            &::-webkit-input-placeholder {
              color: var(--text-brightness-lighter);
            }

            &:focus {
              outline-color: var(--theme-color-primary-default);
            }
          }
        }
      }

      &[sd-inset=true] {
        height: 100%;
        border: none;
      }
    }
  `]
})
export class SdHtmlEditorControl {
  @Input()
  @SdInputValidate(String)
  public get value(): string | undefined {
    return this._value;
  }

  public set value(value: string | undefined) {
    if (this._value !== value) {
      this._value = value;
      this.reloadEditor();
    }
  }

  private _value?: string;

  @Output()
  public readonly valueChange = new EventEmitter<string>();

  @Input()
  @SdInputValidate({ type: String, includes: ["preview", "edit", "code"] })
  public get viewState(): "preview" | "edit" | "code" {
    return this._viewState;
  }

  public set viewState(value: "preview" | "edit" | "code") {
    if (this._viewState !== value) {
      this._viewState = value;
      this.reloadEditor();
    }
  }

  private _viewState: "preview" | "edit" | "code" = "edit";

  @Input()
  @SdInputValidate({ type: Boolean, notnull: true })
  public rowsButton = true;

  @Input()
  @SdInputValidate({ type: Number, notnull: true })
  public rows = 3;

  @Input()
  @SdInputValidate(Boolean)
  @HostBinding("attr.sd-inset")
  public inset?: boolean;

  @Input()
  @SdInputValidate(Boolean)
  @HostBinding("attr.sd-disabled")
  public disabled?: boolean;

  @Input()
  @SdInputValidate({
    type: String,
    notnull: true,
    includes: ["both", "horizontal", "vertical", "none"]
  })
  public resize = "vertical";

  @ViewChild("editor")
  public editorElRef?: ElementRef;

  public constructor(private readonly _zone: NgZone) {
  }

  public onTextareaInput(event: Event): void {
    const textareaEl = event.target as HTMLTextAreaElement;
    const newValue = textareaEl.value;
    if (this.valueChange.observers.length > 0) {
      this.valueChange.emit(newValue);
    }
    else {
      this._value = newValue;
    }
  }

  public onContentInput(event: Event): void {
    const editorEl = event.target as HTMLDivElement;
    const newValue = editorEl.innerHTML;
    if (this.valueChange.observers.length > 0) {
      this.valueChange.emit(newValue);
    }
    else {
      this._value = newValue;
    }
  }

  public reloadEditor(): void {
    setTimeout(() => {
      this._zone.run(() => {
        const editorEl = this.editorElRef?.nativeElement as HTMLDivElement | undefined;
        if (editorEl !== undefined && editorEl.innerHTML !== (this._value ?? "")) {
          editorEl.innerHTML = this._value ?? "";
        }
      });
    });
  }
}
