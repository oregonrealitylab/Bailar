import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {BachataTrainer} from "./BachataTrainer"
import {GlobeController} from "./GlobeController"
import {MainMenuLauncher} from "./MainMenuLauncher"
import {SceneTransition} from "./SceneTransition"
import {UISoundService} from "./UISoundService"

/**
 * The way out of a lesson: back to the globe, from wherever the dancer is.
 *
 * Every other route between screens is one-way — the globe hands off to the
 * dance menu, which hands off to the tutorial — so without this a dancer who
 * picked the wrong dance, or simply finished with it, has no way back short of
 * restarting the Lens.
 *
 * Takes a list of buttons rather than one, because no single panel is on screen
 * for the whole session: the coach panel is hidden between stages, which is
 * exactly when the stage panel appears. One button on each means the exit is
 * always reachable.
 */
@component
export class ExitToGlobe extends BaseScriptComponent {
  @input
  @hint("Every button that should leave the tutorial. One per panel that can be on screen.")
  private exitButtons: Button[]

  @input
  @hint("Screens switched off on the way out — the trainer and the onboarding deck.")
  private tutorialRoots: SceneObject[]

  @input
  @hint("The globe screen, switched back on.")
  private globeScreen: SceneObject

  @input
  @allowUndefined
  @hint(
    "Every dance's trainer. All are torn down on the way out — only one is \
ever running — and each is watched for its lesson being completed."
  )
  private trainers: BachataTrainer[]

  @input
  @allowUndefined
  @hint("The globe, so its orbs come back instead of it reappearing mid-selection.")
  private globe: GlobeController

  @input
  @allowUndefined
  @hint(
    "Main menu, raised automatically when a lesson is finished rather than \
merely abandoned — a dancer who just completed one is most likely going \
straight to the Tracker or the next dance."
  )
  private mainMenu: MainMenuLauncher

  @input
  @hint("Dev only: leave on its own this many seconds after the tutorial opens. 0 disables.")
  private autoExitAfter: number = 0

  private leaving: boolean = false
  private wired: boolean = false

  onAwake(): void {
    // The panels these buttons live on start switched off, so OnStart alone
    // would never run.
    this.createEvent("OnStartEvent").bind(() => this.wire())
    this.createEvent("OnEnableEvent").bind(() => this.wire())
  }

  private wire(): void {
    if (this.wired || !this.exitButtons) {
      return
    }
    this.wired = true

    for (const button of this.exitButtons) {
      if (!button) {
        continue
      }
      UISoundService.attach(button)
      button.onTriggerUp.add(() => this.leave())
    }

    // Finishing a lesson leaves by the same road as quitting one, just with the
    // menu waiting at the end of it.
    for (const trainer of this.trainers ?? []) {
      if (trainer) {
        trainer.onLessonComplete.add(() => this.leave(true))
      }
    }

    if (this.autoExitAfter > 0) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.leave())
      timer.reset(this.autoExitAfter)
    }
  }

  /**
   * Stop the lesson and hand the screen back to the globe.
   *
   * Guarded so a second press during the loading overlay can't queue up a
   * second transition — the swap would then run twice, the second time against
   * a screen that has already been switched off.
   */
  private leave(openMenu: boolean = false): void {
    if (this.leaving) {
      return
    }
    this.leaving = true

    // Before the swap, not inside it: the music and the beat clock should stop
    // the moment the button is pressed, rather than playing on underneath the
    // loading screen for the length of the transition.
    for (const trainer of this.trainers ?? []) {
      if (trainer) {
        trainer.abort()
      }
    }

    const swap = () => {
      for (const root of this.tutorialRoots) {
        if (root) {
          root.enabled = false
        }
      }
      if (this.globeScreen) {
        this.globeScreen.enabled = true
      }
      // The globe was left with a region panel raised and its orbs faded out,
      // and it does not re-run its own set-up on re-enable. Closing that panel
      // is what brings the orbs back and lets a region be picked again.
      if (this.globe) {
        this.globe.closePanel()
      }
      if (openMenu && this.mainMenu) {
        this.mainMenu.open()
      }
      this.leaving = false
    }

    // Same route the lesson was entered by, so leaving looks like arriving.
    const transition = SceneTransition.get()
    if (transition) {
      transition.run(swap)
    } else {
      swap()
    }
  }
}
