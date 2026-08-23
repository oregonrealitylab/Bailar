import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {PanelFader} from "./PanelFader"
import {SceneTransition} from "./SceneTransition"
import {UISoundService} from "./UISoundService"

/**
 * The lens's cold open: a splash image fades up in front of the user, then a
 * Start button fades in over it and hands off to the main menu.
 */
@component
export class OpeningSequenceController extends BaseScriptComponent {
  @input
  @hint("Root of the opening. Disabled once the hand-off completes.")
  private openingRoot: SceneObject

  @input
  @hint("The panel holding the splash image and Start button.")
  private panelRoot: SceneObject

  @input
  @hint("Quad carrying the splash image.")
  private splashVisual: RenderMeshVisual

  @input
  @allowUndefined
  @hint("Button that ends the opening.")
  private startButton: Button

  @input
  @allowUndefined
  @hint("Object holding the Start button, faded in after the image lands.")
  private startButtonRoot: SceneObject

  @input
  @allowUndefined
  @hint("The main menu, faded in once Start is pressed.")
  private mainMenu: SceneObject

  @ui.group_start("Placement")
  @input
  @hint("Distance in front of the head where the panel sits, cm.")
  private splashDistance: number = 170

  @input
  @hint("Splash image size inside the panel, cm. Width then height.")
  private splashSize: vec2 = new vec2(34, 23)
  @ui.group_end

  @ui.group_start("Timing")
  @input
  @hint("Seconds for the splash image to fade up.")
  private splashFadeDuration: number = 1.6

  @input
  @hint("Seconds after the image lands before the button fades in.")
  private buttonDelay: number = 0.8

  @input
  private buttonFadeDuration: number = 0.6
  @ui.group_end

  @input
  @hint("Dev only: auto-press Start this many seconds after it appears. 0 disables.")
  private autoStartAfter: number = 0

  private camera: WorldCameraFinderProvider
  private splashMaterial: Material | null = null
  private buttonFader: PanelFader | null = null

  private elapsed: number = 0
  private buttonShown: boolean = false
  private finished: boolean = false
  private cancelSet: CancelSet = new CancelSet()

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    this.createEvent("OnStartEvent").bind(() => this.begin())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private begin(): void {
    if (this.mainMenu) {
      this.mainMenu.enabled = false
    }
    if (this.startButtonRoot) {
      this.startButtonRoot.enabled = false
    }

    // Clone so the fade never writes back into the shared material asset —
    // otherwise the last frame's opacity persists into the next session.
    if (this.splashVisual) {
      this.splashMaterial = this.splashVisual.mainMaterial.clone()
      this.splashVisual.mainMaterial = this.splashMaterial
      this.splashVisual
        .getSceneObject()
        .getTransform()
        .setLocalScale(new vec3(this.splashSize.x, 1, this.splashSize.y))
    }

    this.place()
    // Zero fade means present from the first frame, not a zero-length tween:
    // starting at nothing and correcting on the next update still shows one
    // frame of empty panel.
    this.setSplashOpacity(this.splashFadeDuration <= 0 ? 1 : 0)

    if (this.startButton) {
      UISoundService.attach(this.startButton)
      this.startButton.onTriggerUp.add(() => this.finish())
      this.startButton.inactive = true
    }
    if (this.startButtonRoot) {
      this.buttonFader = new PanelFader(this.startButtonRoot, [this.startButton], [])
      if (this.splashFadeDuration <= 0 && this.buttonDelay <= 0) {
        this.showStartButton()
      }
    }
  }

  /**
   * The opening hangs on the user's gaze at start-up, so it is anchored to
   * wherever they happen to be facing rather than to world origin.
   *
   * Only the panel is placed — the image and the button are its children now,
   * sitting at authored local offsets like the content of every other screen.
   */
  private place(): void {
    if (!this.panelRoot) {
      return
    }
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    const transform = this.panelRoot.getTransform()
    transform.setWorldPosition(head.add(forward.uniformScale(this.splashDistance)))
    // Face the panel back toward the viewer. UI fronts point down their local
    // +Z, so the yaw aims at the head rather than along the gaze.
    transform.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(-forward.x, -forward.z), 0))
  }

  private onUpdate(): void {
    if (this.finished) {
      return
    }
    this.elapsed += getDeltaTime()

    const fade = Math.min(1, this.elapsed / Math.max(this.splashFadeDuration, 0.001))
    this.setSplashOpacity(easeOutCubic(fade))

    if (fade >= 1 && !this.buttonShown && this.elapsed >= this.splashFadeDuration + this.buttonDelay) {
      this.showStartButton()
    }
  }

  private setSplashOpacity(alpha: number): void {
    if (this.splashMaterial) {
      this.splashMaterial.mainPass.baseColor = new vec4(1, 1, 1, alpha)
    }
  }

  private showStartButton(): void {
    this.buttonShown = true
    if (!this.startButtonRoot) {
      return
    }
    this.startButtonRoot.enabled = true

    // The fader blanks its contents before tweening them back up, so with no
    // fade wanted it is skipped rather than run for zero seconds — otherwise
    // the button flashes out and in on the frame it appears.
    if (this.buttonFadeDuration <= 0 || !this.buttonFader) {
      if (this.startButton) {
        this.startButton.inactive = false
      }
      this.armAutoStart()
      return
    }

    this.buttonFader.fadeIn(this.buttonFadeDuration, () => this.armAutoStart())
  }

  private armAutoStart(): void {
    if (this.autoStartAfter <= 0) {
      return
    }
    const timer = this.createEvent("DelayedCallbackEvent")
    timer.bind(() => this.finish())
    timer.reset(this.autoStartAfter)
  }

  /** Hand off to the main menu through the loading overlay. */
  private finish(): void {
    if (this.finished) {
      return
    }
    this.finished = true

    if (this.startButton) {
      this.startButton.inactive = true
    }

    const fadeOut = (duration: number, done: () => void) => {
      animate({
        duration: duration,
        easing: "ease-in-cubic",
        cancelSet: this.cancelSet,
        update: (t: number) => this.setSplashOpacity(1 - t),
        ended: done
      })
      if (this.buttonFader) {
        this.buttonFader.fadeOut(duration, () => {
          if (this.startButtonRoot) {
            this.startButtonRoot.enabled = false
          }
        })
      }
    }

    // The occluder hides the swap, so the opening doesn't fade itself out.
    const transition = SceneTransition.get()
    if (transition) {
      transition.run(() => this.revealMenu())
    } else {
      fadeOut(0.5, () => this.revealMenu())
    }
  }

  private revealMenu(): void {
    if (this.openingRoot) {
      this.openingRoot.enabled = false
    }
    if (this.mainMenu) {
      // MainMenuController owns its own fade-in and reads the same loading cue
      // budget, so the two halves meet as the clip ends.
      this.mainMenu.enabled = true
    }
  }
}

function easeOutCubic(t: number): number {
  const inverted = 1 - t
  return 1 - inverted * inverted * inverted
}
