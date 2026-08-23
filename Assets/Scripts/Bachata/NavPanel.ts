import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {PanelStack} from "./PanelStack"
import {UISoundService} from "./UISoundService"

/**
 * The chrome every stacked panel shares: X at top left to leave the menu
 * entirely, BACK at top right to step up one level.
 *
 * Both are wired here rather than on each panel so the behaviour can't drift
 * between screens, and so a panel added later gets it for free.
 */
@component
export class NavPanel extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("Top-left button. Closes the whole menu.")
  private closeButton: Button

  @input
  @allowUndefined
  @hint("Top-right button. Returns to the previous panel.")
  private backButton: Button

  @input
  @allowUndefined
  @hint("Buttons on this panel that open another one, in order.")
  private linkButtons: Button[]

  @input
  @allowUndefined
  @hint("Panel each link button opens, same order as Link Buttons.")
  private linkTargets: SceneObject[]

  private wired: boolean = false

  onAwake(): void {
    // Panels are switched off until the stack raises them, and OnStart does not
    // fire on a disabled object — so wire up from whichever event arrives
    // first, and only once.
    this.createEvent("OnStartEvent").bind(() => this.wire())
    this.createEvent("OnEnableEvent").bind(() => this.wire())
  }

  private wire(): void {
    if (this.wired) {
      return
    }
    this.wired = true

    if (this.closeButton) {
      UISoundService.attach(this.closeButton)
      this.closeButton.onTriggerUp.add(() => {
        const stack = PanelStack.get()
        if (stack) {
          stack.closeAll()
        }
      })
    }
    if (this.backButton) {
      UISoundService.attach(this.backButton)
      this.backButton.onTriggerUp.add(() => {
        const stack = PanelStack.get()
        if (stack) {
          stack.back()
        }
      })
    }

    if (!this.linkButtons) {
      return
    }
    for (let i = 0; i < this.linkButtons.length; i++) {
      const button = this.linkButtons[i]
      if (!button) {
        continue
      }
      const target = this.targetFor(i)
      if (!target) {
        // Nothing wired yet — grey it out rather than let it look live.
        button.inactive = true
        continue
      }
      UISoundService.attach(button)
      // Capture the index per iteration, or every button opens the last panel.
      const index = i
      button.onTriggerUp.add(() => this.openLink(index))
    }
  }

  private openLink(index: number): void {
    const target = this.targetFor(index)
    const stack = PanelStack.get()
    if (target && stack) {
      stack.open(target)
    }
  }

  private targetFor(index: number): SceneObject | null {
    if (!this.linkTargets || index < 0 || index >= this.linkTargets.length) {
      return null
    }
    return this.linkTargets[index] ?? null
  }
}
