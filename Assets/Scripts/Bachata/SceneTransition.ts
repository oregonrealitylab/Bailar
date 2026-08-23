import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {UISoundService} from "./UISoundService"

/**
 * The loading screen shown between scenes.
 *
 * A full-screen occluder parented to the camera does the hiding, rather than
 * each screen fading itself out. Panels are made of frames, chrome and text
 * that don't all fade uniformly, so per-panel fades left bits on screen; one
 * quad across the camera hides everything at once, whatever it is made of.
 *
 * The sequence is: occluder fades up until it covers the view, the loading
 * image fades in over it, and the swap happens underneath while nobody can see
 * it.
 * After the hold, the occluder fades away and the new screen is simply there.
 */
@component
export class SceneTransition extends BaseScriptComponent {
  private static instance: SceneTransition | null = null

  @input
  @hint("Full-screen quad parented to the camera. Hides the swap.")
  private occluder: SceneObject

  @input
  @hint("Root of the loading overlay. Disabled except during a transition.")
  private overlayRoot: SceneObject

  @input
  @hint("Quad carrying the loading image.")
  private overlayVisual: RenderMeshVisual

  @input
  @allowUndefined
  @hint(
    "Every screen root in the lens. All of them are switched off once the \
occluder covers the view, so nothing but the loading image is on screen."
  )
  private screenRoots: SceneObject[]

  @input
  @allowUndefined
  @hint(
    "Only needed if the loading image is animated, so it can be restarted on \
each transition. Leave empty for a still image."
  )
  private loadingTexture: Texture

  @ui.group_start("Placement")
  @input
  @hint("Distance the overlay rides in front of the head, cm.")
  private distance: number = 100

  @input
  @hint("Overlay size, cm. Width then height.")
  private size: vec2 = new vec2(35, 25)

  @input
  @hint("Seconds for the overlay to catch up with the gaze. Higher drags more.")
  @widget(new SliderWidget(0.05, 1.5, 0.05))
  private followLag: number = 0.35
  @ui.group_end

  @ui.group_start("Timing")
  @input
  @hint("Seconds for the occluder to blot out the view.")
  private occluderFadeIn: number = 0.45

  @input
  @hint("Seconds for the loading image to fade up, once the view is covered.")
  private overlayFadeIn: number = 0.3

  @input
  @hint("Seconds the image holds at full opacity. The scene swap happens inside this window.")
  private holdDuration: number = 2.0

  @input
  @hint("Seconds for the image and occluder to clear, revealing the new screen.")
  private fadeOutDuration: number = 0.5
  @ui.group_end

  private camera: WorldCameraFinderProvider
  private overlayMaterial: Material | null = null
  private occluderMaterial: Material | null = null
  private position: vec3 = vec3.zero()
  private active: boolean = false
  private busy: boolean = false
  private cancelSet: CancelSet = new CancelSet()

  public static get(): SceneTransition | null {
    return SceneTransition.instance
  }

  onAwake(): void {
    SceneTransition.instance = this
    this.camera = WorldCameraFinderProvider.getInstance()

    if (this.overlayVisual) {
      // Clone so the fade never writes back into the shared material asset.
      this.overlayMaterial = this.overlayVisual.mainMaterial.clone()
      this.overlayVisual.mainMaterial = this.overlayMaterial
      this.overlayVisual.getSceneObject().getTransform().setLocalScale(new vec3(this.size.x, 1, this.size.y))
    }
    if (this.occluder) {
      const image = this.occluder.getComponent("Component.Image") as MaterialMeshVisual
      if (image) {
        this.occluderMaterial = image.mainMaterial.clone()
        image.mainMaterial = this.occluderMaterial
      }
    }

    this.createEvent("OnStartEvent").bind(() => {
      this.setOverlayOpacity(0)
      this.setOccluderOpacity(0)
      if (this.overlayRoot) {
        this.overlayRoot.enabled = false
      }
      if (this.occluder) {
        this.occluder.enabled = false
      }
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /**
   * Run a full transition.
   *
   * @param swap enables the incoming screen and disables the outgoing one.
   *        Called while the occluder covers the view, so it can be abrupt —
   *        nothing it does is visible.
   */
  public run(swap: () => void): void {
    if (this.busy) {
      return
    }
    this.busy = true

    const sound = UISoundService.get()
    if (sound) {
      sound.playLoading()
    }

    if (this.occluder) {
      this.occluder.enabled = true
    }
    this.setOccluderOpacity(0)

    animate({
      duration: this.occluderFadeIn,
      easing: "ease-in-cubic",
      cancelSet: this.cancelSet,
      update: (t: number) => this.setOccluderOpacity(t),
      ended: () => this.showOverlay(swap)
    })
  }

  /** How long a caller should spend fading a screen in, to match this rhythm. */
  public get incomingFadeDuration(): number {
    return this.fadeOutDuration
  }

  private showOverlay(swap: () => void): void {
    this.setOccluderOpacity(1)

    if (!this.overlayRoot) {
      this.performSwap(swap)
      this.holdThenLeave()
      return
    }

    // Snap to the gaze before appearing, otherwise the overlay visibly flies
    // in from wherever the last transition left it.
    this.position = this.gazeTarget()
    this.applyTransform()

    this.overlayRoot.enabled = true
    this.active = true
    this.setOverlayOpacity(0)
    this.restartAnimation()

    animate({
      duration: this.overlayFadeIn,
      easing: "ease-out-cubic",
      cancelSet: this.cancelSet,
      update: (t: number) => this.setOverlayOpacity(t),
      ended: () => {
        // The view is fully covered by now, so the screens can be switched
        // over without any of it showing.
        this.performSwap(swap)
        this.holdThenLeave()
      }
    })
  }

  private performSwap(swap: () => void): void {
    this.hideAllScreens()
    swap()
  }

  private holdThenLeave(): void {
    const timer = this.createEvent("DelayedCallbackEvent")
    timer.bind(() => this.leave())
    timer.reset(this.holdDuration)
  }

  /** Clear the image and the occluder together, revealing the new screen. */
  private leave(): void {
    animate({
      duration: this.fadeOutDuration,
      easing: "ease-out-cubic",
      cancelSet: this.cancelSet,
      update: (t: number) => {
        this.setOverlayOpacity(1 - t)
        this.setOccluderOpacity(1 - t)
      },
      ended: () => {
        this.active = false
        if (this.overlayRoot) {
          this.overlayRoot.enabled = false
        }
        if (this.occluder) {
          this.occluder.enabled = false
        }
        this.busy = false
      }
    })
  }

  private hideAllScreens(): void {
    if (!this.screenRoots) {
      return
    }
    for (const root of this.screenRoots) {
      if (root) {
        root.enabled = false
      }
    }
  }

  /**
   * Rewind an animated loading texture so every transition starts at frame one.
   *
   * A no-op for a still image: nothing is wired in, or what is wired in has no
   * animation provider to rewind.
   */
  private restartAnimation(): void {
    if (!this.loadingTexture) {
      return
    }
    const provider = this.loadingTexture.control as AnimatedTextureFileProvider
    if (provider && provider.play) {
      provider.play(1, 0)
    }
  }

  private onUpdate(): void {
    if (!this.active) {
      return
    }
    const dt = getDeltaTime()
    const target = this.gazeTarget()
    const alpha = this.followLag <= 0 ? 1 : Math.min(1, dt / this.followLag)
    this.position = vec3.lerp(this.position, target, alpha)
    this.applyTransform()
  }

  private gazeTarget(): vec3 {
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    return head.add(gaze.uniformScale(this.distance))
  }

  private applyTransform(): void {
    if (!this.overlayRoot) {
      return
    }
    const transform = this.overlayRoot.getTransform()
    transform.setWorldPosition(this.position)

    // Yaw the card to face the viewer, and only yaw. A full look-at would also
    // pitch and roll it, which composes badly with the quad's own stand-up
    // rotation and turns the card edge-on.
    const toHead = this.camera.getWorldPosition().sub(this.position)
    if (toHead.x * toHead.x + toHead.z * toHead.z > 1e-8) {
      transform.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(toHead.x, toHead.z), 0))
    }
  }

  private setOverlayOpacity(alpha: number): void {
    if (this.overlayMaterial) {
      this.overlayMaterial.mainPass.baseColor = new vec4(1, 1, 1, alpha)
    }
  }

  private setOccluderOpacity(alpha: number): void {
    if (this.occluderMaterial) {
      this.occluderMaterial.mainPass.baseColor = new vec4(0, 0, 0, alpha)
    }
  }
}
