import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {PanelFader} from "./PanelFader"
import {SceneTransition} from "./SceneTransition"
import {UISoundService} from "./UISoundService"

/**
 * A short deck shown between the splash and the trainer: Intro, More info,
 * Ready?. Each slide is its own panel; exactly one is enabled at a time, and
 * its button advances to the next. The last one starts the session.
 */
@component
export class OnboardingController extends BaseScriptComponent {
  @input
  @hint("Slide panels, in order. Only the first is shown at start.")
  private slides: SceneObject[]

  @input
  @hint("Advance button for each slide, same order as Slides.")
  private buttons: Button[]

  @input
  @allowUndefined
  @hint("Frames backing each slide, same order. Used for the closing fade.")
  private frames: Frame[]

  @input
  @allowUndefined
  @hint("Enabled once the last slide is dismissed — the trainer.")
  private experienceRoot: SceneObject

  @input
  @widget(new SliderWidget(0.1, 2.0, 0.05))
  private fadeDuration: number = 0.45

  @input
  @hint("Placed this far in front of the head when the deck opens, cm. 0 keeps the authored position.")
  private spawnDistance: number = 130

  @input
  @hint(
    "Dev only: auto-advance each slide after this many seconds, so the flow can \
be exercised in the preview without a hand to pinch with. 0 disables."
  )
  private autoAdvanceAfter: number = 0

  private camera: WorldCameraFinderProvider
  private index: number = -1
  private started: boolean = false
  private finishing: boolean = false

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    // The splash enables this object, so start from whichever fires first.
    this.createEvent("OnStartEvent").bind(() => this.begin())
    this.createEvent("OnEnableEvent").bind(() => this.begin())
  }

  private begin(): void {
    // OnEnable can beat OnAwake, so bail until the camera reference exists.
    if (this.started || !this.camera) {
      return
    }
    this.started = true

    if (this.experienceRoot) {
      this.experienceRoot.enabled = false
    }
    this.placeInFrontOfHead()

    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i]
      if (!button) {
        continue
      }
      // Capture the index per iteration — a shared loop variable would leave
      // every button advancing from the last slide.
      const slideIndex = i
      UISoundService.attach(button)
      button.onTriggerUp.add(() => this.onSlideAdvanced(slideIndex))
    }

    this.show(0)
    this.fadeInSlide(0)
  }

  /**
   * Fade the opening slide up over the back half of the loading cue the menu
   * started. Advancing between slides is deliberately not treated this way —
   * a two-second transition to turn a page would read as a stall.
   */
  private fadeInSlide(index: number): void {
    const slide = this.slides[index]
    if (!slide) {
      return
    }
    const transition = SceneTransition.get()
    const duration = transition ? transition.incomingFadeDuration : this.fadeDuration
    const fader = new PanelFader(
      slide,
      this.buttons[index] ? [this.buttons[index]] : [],
      this.frames && index < this.frames.length && this.frames[index] ? [this.frames[index]] : []
    )
    fader.fadeIn(duration, () => {})
  }

  private placeInFrontOfHead(): void {
    if (this.spawnDistance <= 0) {
      return
    }
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()
    this.sceneObject.getTransform().setWorldPosition(head.add(forward.uniformScale(this.spawnDistance)))
  }

  /** Ignores presses from a slide that is no longer the active one. */
  private onSlideAdvanced(slideIndex: number): void {
    if (this.finishing || slideIndex !== this.index) {
      return
    }
    if (this.index >= this.slides.length - 1) {
      this.finish()
      return
    }
    this.show(this.index + 1)
  }

  private show(next: number): void {
    this.index = next
    for (let i = 0; i < this.slides.length; i++) {
      const slide = this.slides[i]
      if (slide) {
        slide.enabled = i === next
      }
    }

    if (this.autoAdvanceAfter > 0) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.onSlideAdvanced(next))
      timer.reset(this.autoAdvanceAfter)
    }
  }

  private finish(): void {
    if (this.finishing) {
      return
    }
    this.finishing = true

    const activeSlide = this.slides[this.index]
    const activeButton = this.buttons[this.index]
    const activeFrame = this.frames && this.index < this.frames.length ? this.frames[this.index] : null

    const fader = new PanelFader(
      activeSlide ?? this.sceneObject,
      activeButton ? [activeButton] : [],
      activeFrame ? [activeFrame] : []
    )

    // Leaving the deck for the trainer is a screen change, so it goes through
    // the loading overlay. The occluder hides the swap, so no fade here.
    const transition = SceneTransition.get()
    if (transition) {
      transition.run(() => this.onFadeComplete())
    } else {
      fader.fadeOut(this.fadeDuration, () => this.onFadeComplete())
    }
  }

  private onFadeComplete(): void {
    this.sceneObject.enabled = false
    if (this.experienceRoot) {
      this.experienceRoot.enabled = true
    }
  }
}
