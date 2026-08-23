import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RegionMarker} from "./RegionMarker"

/**
 * The globe screen: pick a region of the world to explore.
 *
 * Places the globe in front of the viewer at start-up, snaps its hand-placed
 * region anchors onto the sphere, and routes a marker press to that region's
 * screen through the loading overlay.
 */
@component
export class GlobeController extends BaseScriptComponent {
  @input
  @hint("Root of the globe screen. Disabled once a region is chosen.")
  private globeRoot: SceneObject

  @input
  @hint("The globe model. Markers are parented here so they turn with it.")
  private globeObject: SceneObject

  @input
  @hint("Markers, in order.")
  private markers: RegionMarker[]

  @input
  @allowUndefined
  @hint("Panel each orb raises, same order as Markers.")
  private regionPanels: SceneObject[]

  @input
  @allowUndefined
  @hint("Close button on each panel, same order as Region Panels.")
  private closeButtons: Button[]

  @input
  @hint("How far in front of the globe, toward the viewer, every panel sits, cm.")
  private panelDepth: number = 45

  @input
  @hint("Vertical offset from the globe's centre, cm. 0 puts the panel level with it.")
  private panelHeight: number = 0

  @ui.group_start("Placement")
  @input
  @hint("Distance in front of the head where the globe floats, cm.")
  private distance: number = 90

  @input
  @hint("Height relative to eye level, cm. Negative sits it lower.")
  private heightOffset: number = -10

  @input
  @hint("Radius of the globe model at scale 1, cm. Used to sit markers on the surface.")
  private globeRadius: number = 25

  @input
  @hint("How far above the surface the anchors sit, as a fraction of the radius.")
  @widget(new SliderWidget(1.0, 1.6, 0.01))
  private markerLift: number = 1.06

  @input
  @hint("Snap anchors onto the sphere at run time. Turn off to use their authored positions exactly.")
  private snapToSurface: boolean = true
  @ui.group_end

  @input
  @hint("Seconds for the globe and buttons to grow to full size when the screen opens.")
  private fadeInDuration: number = 0.6

  @input
  @hint(
    "Seconds for the globe to rise from the dance floor up to its resting \
height. Runs alongside the growth, so the screen looks like it is lifting out \
of the floor the dancer just laid. 0 skips the rise and places it directly."
  )
  private riseDuration: number = 0.9

  @input
  @hint(
    "Overshoot the resting height slightly and settle back, rather than easing \
flatly into it. Reads as the screen coming to rest instead of stopping dead."
  )
  private riseOvershoot: boolean = true

  @input
  @allowUndefined
  @hint(
    "Anything else that should scale up alongside the globe — the Main Menu \
button, so the screen arrives as one piece rather than the globe growing into \
a button that was already sitting there."
  )
  private scaleInWith: SceneObject[]

  @input
  @allowUndefined
  @hint(
    "Dance floor to centre the globe over. With one set, the globe keeps its \
usual height but sits above the floor's middle instead of wherever the dancer \
happened to be looking."
  )
  private floorAnchor: SceneObject

  @input
  @hint("Dev only: auto-press this marker index after N seconds. 0 disables.")
  private autoSelectAfter: number = 0

  @input
  private autoSelectIndex: number = 0

  private openedEvent: Event<void> = new Event<void>()
  /** Fires when an orb raises a region's panel. */
  public readonly onRegionPanelOpened: PublicApi<void> = this.openedEvent.publicApi()

  private closedEvent: Event<void> = new Event<void>()
  /** Fires when that panel is dismissed and the globe is on its own again. */
  public readonly onRegionPanelClosed: PublicApi<void> = this.closedEvent.publicApi()

  private camera: WorldCameraFinderProvider
  private started: boolean = false
  // Where the screen lifts from and where it settles, worked out in place().
  private riseFrom: vec3 | null = null
  private restingAt: vec3 | null = null
  private panelOpen: boolean = false
  private cancelSet: CancelSet = new CancelSet()

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    // Enabled by the opening's transition, so start from whichever fires first.
    this.createEvent("OnStartEvent").bind(() => this.begin())
    this.createEvent("OnEnableEvent").bind(() => this.begin())
  }

  private begin(): void {
    // OnEnable can beat OnAwake, so bail until the camera reference exists.
    if (this.started || !this.camera) {
      return
    }
    this.started = true

    this.hideAllPanels()

    if (this.closeButtons) {
      for (let i = 0; i < this.closeButtons.length; i++) {
        const close = this.closeButtons[i]
        if (close) {
          close.onTriggerUp.add(() => this.closePanel())
        }
      }
    }

    this.place()
    this.snapMarkersToSurface()

    for (let i = 0; i < this.markers.length; i++) {
      const marker = this.markers[i]
      if (!marker) {
        continue
      }
      // Capture the index per iteration — a shared loop variable would leave
      // every marker opening the last region.
      const index = i
      marker.onSelected.add(() => this.select(index))
    }

    this.fadeIn()

    if (this.autoSelectAfter > 0) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.select(this.autoSelectIndex))
      timer.reset(this.autoSelectAfter)
    }
  }

  /** Anchor the globe to wherever the viewer is facing when the screen opens. */
  private place(): void {
    if (!this.globeRoot) {
      return
    }
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    const transform = this.globeRoot.getTransform()
    // Over the floor's centre when there is one, otherwise straight ahead of
    // the dancer. Only the horizontal position comes from the floor — the globe
    // keeps floating at eye height rather than sinking to the ground with it.
    const centre = this.floorAnchor
      ? this.floorAnchor.getTransform().getWorldPosition()
      : head.add(forward.uniformScale(this.distance))

    const resting = new vec3(centre.x, head.y + this.heightOffset, centre.z)
    this.restingAt = resting

    // The rise starts down at the floor the dancer just laid, so the screen
    // reads as coming up out of it rather than appearing in mid-air. Without a
    // floor there is nothing to rise from, so it simply arrives in place.
    const canRise = this.floorAnchor !== undefined && this.floorAnchor !== null && this.riseDuration > 0
    this.riseFrom = canRise
      ? new vec3(centre.x, this.floorAnchor.getTransform().getWorldPosition().y, centre.z)
      : null

    transform.setWorldPosition(this.riseFrom ?? resting)
    transform.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(-forward.x, -forward.z), 0))
  }

  /**
   * Pull each anchor onto the globe's surface along its own direction.
   *
   * The anchors are placed by hand in the scene, so only the *direction* from
   * the globe's centre has to be right — this fixes up the distance. That
   * makes positioning a region a matter of dragging a sphere roughly over it
   * rather than getting its radius exactly right, and it survives the globe
   * being resized.
   */
  private snapMarkersToSurface(): void {
    if (!this.markers || !this.snapToSurface) {
      return
    }
    const lift = this.globeRadius * this.markerLift

    for (const marker of this.markers) {
      if (!marker) {
        continue
      }
      const transform = marker.getSceneObject().getTransform()
      const placed = transform.getLocalPosition()
      if (placed.length < 1e-3) {
        // Never moved off the centre, so there's no direction to work with —
        // leave it alone rather than sending it to an arbitrary pole.
        continue
      }
      const outward = placed.normalize()
      transform.setLocalPosition(outward.uniformScale(lift))
      // Turn the anchor to face out of the globe. `lookAt` aligns local +Z with
      // the direction it is given, so it gets `outward` itself — handing it the
      // negation instead leaves +Z pointing into the sphere, which a solid orb
      // survives but a label does not: text is single-sided, so it renders
      // facing the middle of the earth and is invisible from outside.
      transform.setLocalRotation(quat.lookAt(outward, vec3.up()))
    }
  }

  private fadeIn(): void {
    if (!this.globeObject) {
      return
    }
    // Captured before the tween starts: these are the authored sizes, and
    // scaling from them each frame is what lets several objects of different
    // sizes grow together in step.
    const growing: {transform: Transform; target: vec3}[] = [
      {transform: this.globeObject.getTransform(), target: this.globeObject.getTransform().getLocalScale()}
    ]
    for (const extra of this.scaleInWith ?? []) {
      if (extra) {
        growing.push({transform: extra.getTransform(), target: extra.getTransform().getLocalScale()})
      }
    }

    animate({
      duration: this.fadeInDuration,
      easing: "ease-out-cubic",
      cancelSet: this.cancelSet,
      update: (t: number) => {
        const scale = Math.max(0.001, t)
        for (const item of growing) {
          item.transform.setLocalScale(item.target.uniformScale(scale))
        }
      }
    })

    this.rise()
  }

  /**
   * Lift the whole screen from the floor to its resting height.
   *
   * Driven as a separate tween from the growth so the two can be timed
   * independently — a rise that takes a touch longer than the scale-up reads
   * better than the pair finishing together. Moving `globeRoot` carries the
   * globe, its region orbs and the Main Menu button along with it, since they
   * all hang off it.
   */
  private rise(): void {
    if (!this.globeRoot || !this.riseFrom || !this.restingAt) {
      return
    }
    const from = this.riseFrom
    const to = this.restingAt
    const transform = this.globeRoot.getTransform()

    animate({
      duration: this.riseDuration,
      easing: this.riseOvershoot ? "ease-out-back" : "ease-out-cubic",
      cancelSet: this.cancelSet,
      update: (t: number) => {
        transform.setWorldPosition(vec3.lerp(from, to, t))
      },
      ended: () => {
        // Land exactly on the mark: an overshoot easing can finish a hair off,
        // and everything after this is positioned relative to the globe.
        transform.setWorldPosition(to)
      }
    })
  }

  /**
   * Raise the chosen region's panel and clear the orbs out of the way.
   *
   * Every region's panel appears in the same spot above the globe, so the
   * globe stays put and visible underneath — this is an overlay, not a screen
   * change, which is why it doesn't go through the loading transition.
   */
  public select(index: number): void {
    if (this.panelOpen) {
      return
    }
    const panel = this.panelFor(index)
    if (!panel) {
      return
    }
    this.panelOpen = true

    // All of them, not just the others — the pressed orb has already sprung
    // back to full size, so it fades out alongside the rest.
    this.hideMarkers()

    this.positionPanel(panel)
    panel.enabled = true
    this.openedEvent.invoke()
  }

  /** Clear the orbs off the globe while something else holds the screen. */
  public hideMarkers(): void {
    for (const marker of this.markers) {
      if (marker) {
        marker.fadeOut()
      }
    }
  }

  /** Bring the orbs back. */
  public showMarkers(): void {
    for (const marker of this.markers) {
      if (marker) {
        marker.fadeIn()
      }
    }
  }

  /**
   * Put an object where a region panel would sit.
   *
   * Exposed so the main menu lands in exactly the same place as the region
   * panels rather than carrying its own copy of the placement maths.
   */
  public placePanel(panel: SceneObject): void {
    this.positionPanel(panel)
  }

  /** Drop the open panel and bring the orbs back. */
  public closePanel(): void {
    if (!this.panelOpen) {
      return
    }
    this.panelOpen = false
    this.hideAllPanels()
    this.showMarkers()
    this.closedEvent.invoke()
  }

  /**
   * Float the panel between the viewer and the globe.
   *
   * "In front" is measured from the globe toward the head rather than along a
   * fixed axis, so the panel stays between the two wherever the globe was
   * anchored at start-up. The direction is flattened, so looking up or down
   * doesn't tilt the panel out of the horizontal plane.
   */
  private positionPanel(panel: SceneObject): void {
    if (!this.globeRoot) {
      return
    }
    const globe = this.globeRoot.getTransform()
    const centre = globe.getWorldPosition()

    const toHead = this.camera.getWorldPosition().sub(centre)
    const flat = new vec3(toHead.x, 0, toHead.z)
    const towardViewer = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    panel
      .getTransform()
      .setWorldPosition(
        centre.add(towardViewer.uniformScale(this.panelDepth)).add(new vec3(0, this.panelHeight, 0))
      )
    // Square to the viewer, matching how the globe itself was placed.
    panel.getTransform().setWorldRotation(globe.getWorldRotation())
  }

  private hideAllPanels(): void {
    if (!this.regionPanels) {
      return
    }
    for (const panel of this.regionPanels) {
      if (panel) {
        panel.enabled = false
      }
    }
  }

  private panelFor(index: number): SceneObject | null {
    if (!this.regionPanels || index < 0 || index >= this.regionPanels.length) {
      return null
    }
    return this.regionPanels[index] ?? null
  }

}
