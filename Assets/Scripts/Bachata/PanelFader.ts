import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"

/**
 * Fades a panel subtree out: UIKit button fills, frame bodies, and every Text
 * underneath the root.
 *
 * Shared by the splash and the onboarding deck so the hand-off between screens
 * looks the same wherever it happens.
 */
export class PanelFader {
  private labels: Text[] = []
  private labelAlphas: number[] = []
  private cancel: CancelSet = new CancelSet()
  private running: boolean = false

  /**
   * Caches each Text's authored alpha at construction, so the fade scales every
   * label from its own opacity instead of snapping them all to full white first.
   */
  constructor(
    root: SceneObject,
    private buttons: Button[],
    private frames: Frame[]
  ) {
    this.collect(root)
  }

  /**
   * Fade a panel up from nothing. Buttons stay inactive until the fade lands,
   * so a press can't register against a half-visible control.
   */
  public fadeIn(duration: number, onComplete: () => void): void {
    this.cancel.cancel()
    this.running = false
    this.setOpacity(0)

    for (const button of this.buttons) {
      if (button) {
        button.inactive = true
      }
    }
    // Frame bodies are deliberately not tweened on the way in. A panel is
    // usually enabled in the same frame this runs, and its Frame hasn't built
    // its visual yet — tweening it here throws inside the UIKit animation.
    // The body appears at full opacity while its contents fade up, which reads
    // fine and avoids depending on component init order.

    animate({
      duration: duration,
      easing: "ease-out-cubic",
      cancelSet: this.cancel,
      update: (t: number) => this.setOpacity(t),
      ended: () => {
        for (const button of this.buttons) {
          if (button) {
            button.inactive = false
          }
        }
        onComplete()
      }
    })
  }

  /** Returns false if a fade is already in flight. */
  public fadeOut(duration: number, onComplete: () => void): boolean {
    if (this.running) {
      return false
    }
    this.running = true

    // Kill interaction up front so nothing can be re-triggered mid-fade.
    for (const button of this.buttons) {
      if (button) {
        button.inactive = true
      }
    }

    // SnapOS3 frames force autoShowHide off, which makes tweenOpacity a no-op
    // on the body. Turn it on for the duration of the fade — the panel is
    // disabled at the end, so hover-driven show/hide never gets a chance to run.
    for (const frame of this.frames) {
      if (frame) {
        frame.autoShowHide = true
        frame.tweenOpacity(1, 0)
      }
    }

    animate({
      duration: duration,
      easing: "ease-out-cubic",
      cancelSet: this.cancel,
      update: (t: number) => this.setOpacity(1 - t),
      ended: onComplete
    })
    return true
  }

  private setOpacity(alpha: number): void {
    for (const button of this.buttons) {
      if (button) {
        button.opacity = alpha
      }
    }
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i]
      const color = label.textFill.color
      label.textFill.color = new vec4(color.x, color.y, color.z, this.labelAlphas[i] * alpha)
    }
  }

  private collect(root: SceneObject): void {
    const texts = root.getComponents("Component.Text") as Text[]
    for (const text of texts) {
      this.labels.push(text)
      this.labelAlphas.push(text.textFill.color.w)
    }
    for (let i = 0; i < root.getChildrenCount(); i++) {
      this.collect(root.getChild(i))
    }
  }
}
