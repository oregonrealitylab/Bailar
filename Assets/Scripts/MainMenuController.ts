import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {PanelFader} from "./Bachata/PanelFader"
import {SceneTransition} from "./Bachata/SceneTransition"
import {UISoundService} from "./Bachata/UISoundService"

/**
 * Main menu: pick a dance, and the menu hands off to that dance's tutorial.
 *
 * `destinations` is parallel to `buttons`. A button with nothing wired into
 * its slot is held inactive rather than hidden — the menu should show what is
 * coming without pretending it is ready.
 */
@component
export class MainMenuController extends BaseScriptComponent {
  @input
  @hint("Root of the menu panel. Disabled once the fade-out finishes.")
  private menuRoot: SceneObject

  @input
  @allowUndefined
  @hint("Frame backing the menu. Faded alongside the buttons and labels.")
  private panelFrame: Frame

  @input
  @hint("One button per dance, in menu order.")
  private buttons: Button[]

  @input
  @allowUndefined
  @hint(
    "Screen each button opens, same order as Buttons. Leave a slot empty and \
that dance becomes a coming-soon button."
  )
  private destinations: SceneObject[]

  @input
  @hint(
    "What a dance with no lesson yet says while it is hovered. Stacked over two \
lines, because on one it runs past the edges of the button."
  )
  private comingSoonText: string = "COMING\nSOON"

  @input
  @widget(new SliderWidget(0.1, 2.0, 0.05))
  private fadeDuration: number = 0.45

  @input
  @hint(
    "Dev only: auto-press this button index after autoSelectAfter seconds, so \
the flow can be exercised in the preview without a hand to pinch with."
  )
  private autoSelectIndex: number = 0

  @input
  @hint("Dev only: seconds before the auto-press. 0 disables.")
  private autoSelectAfter: number = 0

  private fader: PanelFader
  private dismissing: boolean = false
  private started: boolean = false

  onAwake(): void {
    // The opening sequence enables this object, and OnStart does not fire
    // while it is disabled — so kick off from whichever comes first.
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("OnEnableEvent").bind(() => this.reopen())
  }

  /**
   * Put the menu back into a usable state each time it is shown.
   *
   * Picking a dance switches `menuRoot` off and latches `dismissing` so a
   * double pinch can't start two transitions. Neither is undone anywhere,
   * because until there was a way back from a lesson this screen was only ever
   * visited once — coming back to it would otherwise show an empty frame whose
   * buttons no longer respond.
   */
  private reopen(): void {
    this.dismissing = false
    if (this.menuRoot) {
      this.menuRoot.enabled = true
    }
    this.onStart()
  }

  private onStart(): void {
    if (this.started) {
      return
    }
    this.started = true

    if (this.destinations) {
      for (const destination of this.destinations) {
        if (destination) {
          destination.enabled = false
        }
      }
    }

    this.fader = new PanelFader(this.menuRoot ?? this.sceneObject, this.buttons, [this.panelFrame])

    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i]
      if (!button) {
        continue
      }
      if (!this.destinationFor(i)) {
        this.markComingSoon(button)
        continue
      }
      UISoundService.attach(button)
      // Capture the index per iteration — a shared loop variable would leave
      // every button opening the last dance.
      const index = i
      button.onTriggerUp.add(() => this.select(index))
    }

    // Arriving from behind the loading overlay, so fade up rather than pop in.
    const transition = SceneTransition.get()
    this.fader.fadeIn(transition ? transition.incomingFadeDuration : this.fadeDuration, () => {})

    if (this.autoSelectAfter > 0) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.select(this.autoSelectIndex))
      timer.reset(this.autoSelectAfter)
    }
  }

  /**
   * Fade the menu away and open the chosen dance. Safe to call twice — the
   * second call is dropped so a double pinch can't restart the fade.
   */
  public select(index: number): void {
    if (this.dismissing) {
      return
    }
    const destination = this.destinationFor(index)
    if (!destination) {
      return
    }
    this.dismissing = true

    const swap = () => {
      if (this.menuRoot) {
        this.menuRoot.enabled = false
      }
      destination.enabled = true
    }

    // The occluder hides the swap, so this screen doesn't fade itself out.
    const transition = SceneTransition.get()
    if (transition) {
      transition.run(swap)
    } else {
      this.fader.fadeOut(this.fadeDuration, swap)
    }
  }

  /**
   * A dance with no lesson behind it yet.
   *
   * Left interactive on purpose rather than marked inactive. Inactive switches
   * the Interactable off, so the button stops answering the pointer entirely —
   * it sits there dead while every other control on the panel lights up, which
   * reads as broken rather than as unfinished. Keeping the hover and saying
   * "coming soon" in the one place the dancer is already looking explains it
   * instead. Nothing is bound to the press, so it still does nothing.
   *
   * No hover cue is attached either: a button that sounds like the live ones
   * would be promising something it cannot deliver.
   */
  private markComingSoon(button: Button): void {
    const label = this.findLabel(button.getSceneObject())
    if (!label) {
      return
    }
    const original = label.text
    button.onHoverEnter.add(() => {
      label.text = this.comingSoonText
    })
    button.onHoverExit.add(() => {
      label.text = original
    })
  }

  private findLabel(root: SceneObject): Text | null {
    const own = root.getComponent("Component.Text")
    if (own) {
      return own as Text
    }
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findLabel(root.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private destinationFor(index: number): SceneObject | null {
    if (!this.destinations || index < 0 || index >= this.destinations.length) {
      return null
    }
    return this.destinations[index] ?? null
  }
}
