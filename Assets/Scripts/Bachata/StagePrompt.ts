import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {UISoundService} from "./UISoundService"

/**
 * The between-stages panel: a message and an optional continue button.
 *
 * Reused for both the hand-off into the forward/back stage and the closing
 * congratulations, which differ only in whether there is anything left to
 * press.
 *
 * This script deliberately lives on an always-enabled object rather than on
 * the panel it controls: a script on a disabled SceneObject never runs its
 * lifecycle, so it could not enable itself back on.
 */
@component
export class StagePrompt extends BaseScriptComponent {
  @input
  @hint("The panel to show and hide. Should start disabled in the scene.")
  private root: SceneObject

  @input
  private messageText: Text

  @input
  @allowUndefined
  private button: Button

  @input
  @allowUndefined
  @hint("Object holding the button, hidden when a message has nothing to press.")
  private buttonObject: SceneObject

  @input
  @allowUndefined
  private buttonLabel: Text

  @input
  @allowUndefined
  @hint("Optional second button, sitting above the main one — 'Watch Again'.")
  private secondaryButton: Button

  @input
  @allowUndefined
  @hint("Object holding the second button, hidden whenever nothing is offered on it.")
  private secondaryObject: SceneObject

  @input
  @allowUndefined
  private secondaryLabel: Text

  @input
  @hint(
    "Dev only: auto-press the button this many seconds after the panel appears, \
so the flow can be exercised in the preview without a hand to pinch with. \
0 disables."
  )
  private autoContinueAfter: number = 0

  private onContinue: (() => void) | null = null
  private onSecondary: (() => void) | null = null
  private attached: boolean = false
  // Kept so the handler can be taken off again before it is put back on. A
  // panel that is shown, torn down and shown again would otherwise stack a
  // second handler on the same button, or — worse — be left holding one that
  // no longer points anywhere useful.
  private continueHandler: (() => void) | null = null
  private secondaryHandler: (() => void) | null = null

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.hide())
  }

  /**
   * Pass null for `buttonText` to show a message with no way forward.
   *
   * `secondaryText` adds a second button above the first; pass null to leave it
   * off, which is what the closing message and the between-stages hand-off do.
   */
  public show(
    message: string,
    buttonText: string | null,
    onContinue: () => void,
    secondaryText: string | null = null,
    onSecondary: (() => void) | null = null
  ): void {
    this.onContinue = onContinue
    this.onSecondary = onSecondary

    if (this.secondaryLabel && secondaryText !== null) {
      this.secondaryLabel.text = secondaryText
    }
    if (this.secondaryObject) {
      this.secondaryObject.enabled = secondaryText !== null
    }

    if (this.messageText) {
      this.messageText.text = message
    }
    if (this.buttonLabel && buttonText !== null) {
      this.buttonLabel.text = buttonText
    }
    if (this.buttonObject) {
      this.buttonObject.enabled = buttonText !== null
    }
    if (this.root) {
      this.root.enabled = true
    }

    // Subscribe only once the panel is live. The Button initialises with its
    // SceneObject, so wiring this up while the panel was still disabled would
    // attach to a component that hasn't set itself up yet.
    //
    // The sound is attached once, but the trigger handler is renewed on every
    // show: a lesson that is left and re-entered tears this panel down in
    // between, and re-arming here is what stops the second visit finding a
    // button that no longer does anything.
    if (this.button) {
      if (!this.attached) {
        this.attached = true
        UISoundService.attach(this.button)
      }
      if (this.continueHandler) {
        this.button.onTriggerUp.remove(this.continueHandler)
      }
      this.continueHandler = () => this.handleContinue()
      this.button.onTriggerUp.add(this.continueHandler)
      this.button.inactive = buttonText === null
    }

    if (this.secondaryButton) {
      if (this.secondaryHandler) {
        this.secondaryButton.onTriggerUp.remove(this.secondaryHandler)
      }
      this.secondaryHandler = () => this.handleSecondary()
      this.secondaryButton.onTriggerUp.add(this.secondaryHandler)
      this.secondaryButton.inactive = secondaryText === null
      if (secondaryText !== null) {
        UISoundService.attach(this.secondaryButton)
      }
    }

    if (this.autoContinueAfter > 0 && buttonText !== null) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.handleContinue())
      timer.reset(this.autoContinueAfter)
    }
  }

  public hide(): void {
    if (this.root) {
      this.root.enabled = false
    }
  }

  /** Move the panel to a world spot — used to line it up with the coach panel. */
  public setWorldPosition(position: vec3): void {
    if (this.root) {
      this.root.getTransform().setWorldPosition(position)
    }
  }

  private handleContinue(): void {
    const callback = this.onContinue
    this.onContinue = null
    this.onSecondary = null
    if (callback) {
      callback()
    }
  }

  private handleSecondary(): void {
    const callback = this.onSecondary
    this.onSecondary = null
    this.onContinue = null
    if (callback) {
      callback()
    }
  }
}
