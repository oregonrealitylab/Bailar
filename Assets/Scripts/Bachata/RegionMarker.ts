import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {UISoundService} from "./UISoundService"

/**
 * A marker anchored over one region of the globe.
 *
 * Two shapes are supported. With an Orb Visual wired it is a tinted sphere with
 * an invisible hit target over it. With that slot empty the button itself is
 * the marker — a themed control carrying the region's name — and the theme
 * handles its own hover, so nothing here tints anything.
 *
 * Either way, pinching squeezes it while held and releasing lets it spring back
 * before it fades out. The release is what counts as the selection, so the
 * squeeze reads as "holding" rather than "chosen".
 */
@component
export class RegionMarker extends BaseScriptComponent {
  @input
  @hint("Name of the region this orb stands for.")
  private regionName: string = "Region"

  @input
  @hint("Invisible hit target for hover and pinch.")
  private hitButton: Button

  @input
  @allowUndefined
  @hint(
    "The orb itself, tinted and faded by hand. Leave empty to use the button as \
the marker instead, in which case the theme draws it and the colours below go \
unused."
  )
  private orbVisual: RenderMeshVisual

  @ui.group_start("Look")
  @input("vec4", "{1,0.83,0.25,1}")
  @widget(new ColorWidget())
  private normalColor: vec4 = new vec4(1, 0.83, 0.25, 1)

  @input("vec4", "{0.35,1,0.6,1}")
  @widget(new ColorWidget())
  @hint("Tint while the pointer is over the orb.")
  private hoverColor: vec4 = new vec4(0.35, 1, 0.6, 1)

  @input
  @hint("How far the orb squashes while pinched, as a fraction of its size.")
  @widget(new SliderWidget(0.3, 1, 0.05))
  private squeezeScale: number = 0.7
  @ui.group_end

  @ui.group_start("Timing")
  @input
  @widget(new SliderWidget(0.03, 0.5, 0.01))
  private squeezeDuration: number = 0.1

  @input
  @widget(new SliderWidget(0.05, 0.8, 0.01))
  private releaseDuration: number = 0.16

  @input
  @widget(new SliderWidget(0.1, 1.5, 0.05))
  private fadeDuration: number = 0.35
  @ui.group_end

  private onSelectedEvent: Event<RegionMarker> = new Event<RegionMarker>()
  /** Fires once the orb has sprung back from its squeeze. */
  public readonly onSelected: PublicApi<RegionMarker> = this.onSelectedEvent.publicApi()

  private material: Material | null = null
  private baseScale: vec3 = vec3.one()
  private currentColor: vec4 = new vec4(1, 1, 1, 1)
  private opacity: number = 1
  private scaleCancel: CancelSet = new CancelSet()
  private fadeCancel: CancelSet = new CancelSet()
  private hovered: boolean = false

  public get region(): string {
    return this.regionName
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  /** Whichever object stands for the marker — the orb, or the button itself. */
  private markerObject(): SceneObject | null {
    if (this.orbVisual) {
      return this.orbVisual.getSceneObject()
    }
    return this.hitButton ? this.hitButton.getSceneObject() : null
  }

  private onStart(): void {
    const orbObject = this.markerObject()
    if (orbObject) {
      this.baseScale = orbObject.getTransform().getLocalScale()
    }
    if (this.orbVisual) {
      // Clone so each orb tints and fades on its own, instead of every orb
      // sharing one material and lighting up together.
      this.material = this.orbVisual.mainMaterial.clone()
      this.orbVisual.mainMaterial = this.material
    }
    this.currentColor = this.normalColor
    this.applyMaterial()

    if (!this.hitButton) {
      return
    }

    // Pin the hit target onto the orb.
    //
    // The button prefab carries its own offset, which left the collider
    // floating several centimetres above the orb — pointing straight at the
    // sphere missed, and pointing at empty space above it registered. Forcing
    // the local transform here means the target is centred no matter what the
    // prefab was authored with.
    const hitObject = this.hitButton.getSceneObject()
    hitObject.getTransform().setLocalPosition(vec3.zero())
    hitObject.getTransform().setLocalRotation(quat.quatIdentity())
    if (orbObject) {
      hitObject.getTransform().setLocalScale(vec3.one())
    }

    // Only hidden when there is an orb in front of it to be the visible part.
    if (this.orbVisual) {
      this.hitButton.opacity = 0
    }
    UISoundService.attach(this.hitButton)

    this.hitButton.onHoverEnter.add(() => this.setHovered(true))
    this.hitButton.onHoverExit.add(() => this.setHovered(false))
    this.hitButton.onTriggerDown.add(() => this.squeeze())
    this.hitButton.onTriggerUp.add(() => this.release())
  }

  private setHovered(hovered: boolean): void {
    this.hovered = hovered
    if (!this.material) {
      // Button marker: the theme already brightens it on hover, and tinting on
      // top would fight that.
      return
    }
    this.currentColor = hovered ? this.hoverColor : this.normalColor
    this.applyMaterial()
  }

  private squeeze(): void {
    this.tweenScale(this.squeezeScale, this.squeezeDuration, "ease-out-quad", () => {})
  }

  /**
   * Spring back to full size, and only then report the selection — so the
   * caller's fade-out starts from an orb at rest rather than a squashed one.
   */
  private release(): void {
    this.tweenScale(1, this.releaseDuration, "ease-out-back", () => {
      this.onSelectedEvent.invoke(this)
    })
  }

  private tweenScale(target: number, duration: number, easing: string, ended: () => void): void {
    const orbObject = this.markerObject()
    if (!orbObject) {
      ended()
      return
    }
    this.scaleCancel.cancel()
    const from = orbObject.getTransform().getLocalScale()
    const to = this.baseScale.uniformScale(target)

    animate({
      duration: duration,
      easing: easing as never,
      cancelSet: this.scaleCancel,
      update: (t: number) => {
        orbObject.getTransform().setLocalScale(vec3.lerp(from, to, t))
      },
      ended: ended
    })
  }

  /** Fade the orb away. Also drops its hit target so it can't be re-pressed. */
  public fadeOut(duration?: number): void {
    this.setInteractive(false)
    this.tweenOpacity(0, duration ?? this.fadeDuration)
  }

  /** Bring the orb back, at rest and at its normal tint. */
  public fadeIn(duration?: number): void {
    this.scaleCancel.cancel()
    const orbObject = this.markerObject()
    if (orbObject) {
      orbObject.getTransform().setLocalScale(this.baseScale)
    }
    this.hovered = false
    this.currentColor = this.normalColor
    this.tweenOpacity(1, duration ?? this.fadeDuration, () => this.setInteractive(true))
  }

  private tweenOpacity(target: number, duration: number, ended?: () => void): void {
    this.fadeCancel.cancel()
    const from = this.opacity

    animate({
      duration: duration,
      easing: "ease-out-cubic",
      cancelSet: this.fadeCancel,
      update: (t: number) => {
        this.opacity = from + (target - from) * t
        this.applyMaterial()
      },
      ended: () => {
        this.opacity = target
        this.applyMaterial()
        if (ended) {
          ended()
        }
      }
    })
  }

  private setInteractive(interactive: boolean): void {
    if (this.hitButton) {
      this.hitButton.inactive = !interactive
    }
  }

  private applyMaterial(): void {
    if (!this.material) {
      // Button marker: fading means the control's own opacity.
      if (this.hitButton) {
        this.hitButton.opacity = this.opacity
      }
      return
    }
    this.material.mainPass.baseColor = new vec4(
      this.currentColor.x,
      this.currentColor.y,
      this.currentColor.z,
      this.currentColor.w * this.opacity
    )
  }
}
