import { Injectable, Injector } from "@angular/core";
import { EventManager } from "@angular/platform-browser";
import { NeverEntryError } from "@simplysm/sd-core-common";
import { SdModalProvider } from "../providers/SdModalProvider";

@Injectable({ providedIn: null })
export class SdSaveEventPlugin {
  public manager!: EventManager;

  private readonly _modal: SdModalProvider;

  public constructor(private readonly _injector: Injector) {
    this._modal = this._injector.get(SdModalProvider);
  }

  public addEventListener(element: HTMLElement, eventName: string, handler: (event: Event) => void): () => void {
    const listener = (event: KeyboardEvent): void => {
      if (element.offsetParent == null) return;

      if ((event.key === "s" || event.key === "S") && event.ctrlKey) {
        event.preventDefault();
        if (this._modal.modalCount > 0) return;

        this.manager.getZone().run(() => {
          handler(event);
        });
      }
    };

    document.addEventListener("keydown", listener);

    return (): void => {
      document.removeEventListener("keydown", listener);
    };
  }

  public addGlobalEventListener(element: string, eventName: string, handler: Function): Function {
    if (element === "document") {
      const listener = (event: KeyboardEvent): void => {
        if ((event.key === "s" || event.key === "S") && event.ctrlKey) {
          event.preventDefault();
          if (this._modal.modalCount > 0) return;

          this.manager.getZone().run(() => {
            handler(event);
          });
        }
      };

      document.addEventListener("keydown", listener);

      return (): void => {
        document.removeEventListener("keydown", listener);
      };
    }

    throw new NeverEntryError();
  }

  public supports(eventName: string): boolean {
    return eventName === "sdSave";
  }
}
