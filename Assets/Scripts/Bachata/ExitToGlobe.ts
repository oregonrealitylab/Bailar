import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {BachataTrainer} from "./BachataTrainer"
import {GlobeController} from "./GlobeController"
import {MainMenuLauncher} from "./MainMenuLauncher"
import {OnboardingController} from "./OnboardingController"
import {SceneTransition} from "./SceneTransition"
import {StagePrompt} from "./StagePrompt"
import {UISoundService} from "./UISoundService"

/**
 * The way out of a lesson: restart the dance, or go back to the globe, from
 * wherever the dancer is.
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
 *
 * Pressing X does not leave straight away: it raises a prompt over the panel
 * it was pressed on, offering Restart (back to the first slide of the same
 * dance) or Main Menu (back to the globe).
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
  @allowUndefined
  @hint(
    "Each dance's onboarding deck, same order as Trainers. Restart reopens the \
one belonging to whichever dance is running."
  )
  private onboardings: OnboardingController[]

  @ui.group_start("Exit prompt")
  @input
  @allowUndefined
  @hint("Panel raised by X. Leave empty to have X go straight back to the globe.")
  private prompt: StagePrompt

  @input
  private promptMessage: string = "Leave this dance?"

  @input
  private restartLabel: string = "Restart"

  @input
  private menuLabel: string = "Main Menu"

  @input
  @hint("How far the prompt sits in front of the panel it covers, toward the viewer, cm.")
  private promptLift: number = 8
  @ui.group_end

  @input
  @hint("Dev only: press X on its own this many seconds after the tutorial opens. 0 disables.")
  private autoExitAfter: number = 0

  private camera: WorldCameraFinderProvider
  private leaving: boolean = false
  private wired: boolean = false

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
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
      button.onTriggerUp.add(() => this.ask(button))
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
      timer.bind(() => this.ask(this.exitButtons[0]))
      timer.reset(this.autoExitAfter)
    }
  }

  /**
   * Raise the Restart / Main Menu prompt over the panel X was pressed on.
   *
   * The dance is worked out now rather than when Restart is pressed, while the
   * panel that was pressed is still the one on screen.
   */
  private ask(pressed: Button): void {
    if (this.leaving) {
      return
    }
    if (!this.prompt) {
      this.leave()
      return
    }
    const dance = this.activeDance()

    const panel = pressed ? pressed.getSceneObject().getParent() : null
    if (panel) {
      const transform = panel.getTransform()
      const position = transform.getWorldPosition()
      const toViewer = this.camera.getWorldPosition().sub(position)
      const lift = toViewer.length < 1e-4 ? vec3.zero() : toViewer.normalize().uniformScale(this.promptLift)
      this.prompt.setWorldPosition(position.add(lift))
      this.prompt.setWorldRotation(transform.getWorldRotation())
    }

    this.prompt.show(
      this.promptMessage,
      this.menuLabel,
      () => this.leave(),
      this.restartLabel,
      () => this.restart(dance)
    )
  }

  /** Index into Trainers of the dance on screen — its deck or its lesson. */
  private activeDance(): number {
    const trainers = this.trainers ?? []
    for (let i = 0; i < trainers.length; i++) {
      const trainer = trainers[i]
      const deck = this.onboardings && i < this.onboardings.length ? this.onboardings[i] : null
      if (
        (trainer && trainer.getSceneObject().isEnabledInHierarchy) ||
        (deck && deck.getSceneObject().isEnabledInHierarchy)
      ) {
        return i
      }
    }
    return -1
  }

  /**
   * Stop the lesson and start the same dance again from its first slide.
   *
   * Every tutorial screen is switched off first, then the dance's own deck is
   * switched back on — the deck rewinds to its first slide whenever it is
   * enabled, and turns its trainer off again itself.
   */
  private restart(dance: number): void {
    const deck = this.onboardings && dance >= 0 && dance < this.onboardings.length ? this.onboardings[dance] : null
    if (!deck) {
      this.leave()
      return
    }
    if (this.leaving) {
      return
    }
    this.leaving = true
    this.stopTrainers()

    const swap = () => {
      for (const root of this.tutorialRoots) {
        if (root) {
          root.enabled = false
        }
      }
      deck.getSceneObject().enabled = true
      this.leaving = false
    }

    const transition = SceneTransition.get()
    if (transition) {
      transition.run(swap)
    } else {
      swap()
    }
  }

  /** Also takes the exit prompt down, so it is never left over the next screen. */
  private stopTrainers(): void {
    if (this.prompt) {
      this.prompt.hide()
    }
    for (const trainer of this.trainers ?? []) {
      if (trainer) {
        trainer.abort()
      }
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
    this.stopTrainers()

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
