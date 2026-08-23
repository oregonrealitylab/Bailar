import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {FloorVerdict, SurfaceSense, SurfaceSource} from "./SurfaceSense"
import {UISoundService} from "./UISoundService"

/**
 * Lays the dance floor before the lesson picker appears.
 *
 * The dancer looks at the ground and the floor plate follows their gaze until
 * they confirm it. Everything after this — the globe, and the routines that
 * need room either side of the dancer — is anchored to where the plate landed,
 * so this is the step that decides where the whole experience lives.
 *
 * Judging the spot is left to {@link SurfaceSense}, which uses whatever the
 * device supports. This screen only decides what the dancer is told and when
 * the confirm button unlocks.
 */
@component
export class FloorPlacement extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint(
    "Device Tracking, in World mode. Unlocks plane detection and room \
classification — without it placement drops to plain hit testing."
  )
  private deviceTracking: DeviceTracking

  @input
  @allowUndefined
  @hint("World Query module, used when planes are unavailable.")
  private worldQuery: WorldQueryModule

  @input
  @hint("The floor plate. Moved to follow the gaze, then left where it is confirmed.")
  private floorRoot: SceneObject

  @input
  @allowUndefined
  @hint("Line telling the dancer what to do.")
  private promptText: Text

  @input
  @hint("Enabled once the floor is down — the globe screen.")
  private nextScreen: SceneObject

  @input
  @allowUndefined
  @hint(
    "Switched off once the floor is down: the prompt line and the \"Pinch to \
Set\" hint. The plate itself stays — it is the dancer's marked-out area \
for the rest of the session, not a placement aid."
  )
  private hideOnPlaced: SceneObject[]

  @ui.group_start("Surface")
  @input
  @hint(
    "How far a surface may lean from flat and still count as floor, degrees. \
Only consulted on the hit-test fallback: plane detection is restricted to \
horizontal at the source, so walls never reach this check."
  )
  @widget(new SliderWidget(5, 60, 1))
  private maxTiltDegrees: number = 25

  @input
  @hint("How far ahead to look for a surface, cm.")
  private reach: number = 500

  @input
  @hint("Never accept a surface above this height relative to the eye, cm. Keeps ceilings out.")
  private ceilingGuard: number = -20

  @input
  @hint(
    "Width of the square floor, cm. Drives the plate's own geometry, its \
collider, and the area of room judged underneath it — change this and \
everything follows."
  )
  private floorSize: number = 60

  @input
  @allowUndefined
  @hint(
    "The soft-edged floor surface. Carries the gradient and the fade, and is \
scaled from floorSize like everything else. The plate's own hard-edged visual \
is hidden in favour of this."
  )
  private floorSurface: SceneObject

  @input
  @hint(
    "How much wider to cut the surface quad than the floor itself. The \
texture's solid centre only covers the middle ~70% — the rest is the fade — so \
the quad has to run past the floor's nominal edge for the solid part to measure \
floorSize."
  )
  @widget(new SliderWidget(1, 2, 0.05))
  private surfaceOversize: number = 1.45

  @input
  @allowUndefined
  @hint("The surface's normal look: the violet-to-teal sweep with faded edges.")
  private surfaceTexture: Texture

  @input
  @allowUndefined
  @hint(
    "Shown instead while the spot is refused — the same sweep and the same \
faded edges in red, so the floor reads as unplaceable at a glance without \
having to read the line above it."
  )
  private refusedTexture: Texture

  @input
  @allowUndefined
  @hint(
    "The lettering on the plate. Scaled and repositioned with the floor so the \
type keeps its proportions at any size, rather than staying 60cm-sized on a \
plate twice that wide."
  )
  private labels: SceneObject[]

  @input
  @hint(
    "The floor width the lettering was laid out against, cm. Only used as the \
baseline for scaling the labels — leave it alone unless you re-position them \
by hand."
  )
  private designSize: number = 60

  @input
  @hint(
    "How much of the square must read as floor to accept it, 0-1. Lower it if \
placement feels fussy in cluttered rooms. Only used where the device can \
classify what it is looking at."
  )
  @widget(new SliderWidget(0.5, 1, 0.05))
  private minFloorFraction: number = 0.9
  @ui.group_end

  @ui.group_start("Fallback")
  @input
  @hint(
    "Give up looking for real floor after this many seconds and show the plate \
at arm's length anyway, so nobody is stranded on a screen that will not \
advance. The editor needs this: it reports plane and mesh support it does not \
actually provide."
  )
  private fallbackAfter: number = 4

  @input
  @hint(
    "Development aid: confirm the floor by itself this many seconds after it \
becomes valid, so the rest of the flow can be walked through without a pinch. \
0 leaves it to the dancer, which is what ships."
  )
  private autoConfirmAfter: number = 0

  @input
  @hint("Where the plate sits when no surface can be found: distance ahead, cm.")
  private fallbackDistance: number = 150

  @input
  @hint("...and how far below eye level, cm.")
  private fallbackDrop: number = 120
  @ui.group_end

  @ui.group_start("Copy")
  @input
  private lookingCopy: string = "Look at the floor in front of you"

  @input
  private readyCopy: string = "Press Set Floor to lay it here"

  @input
  private notFloorCopy: string = "That's not a floor — look down"

  @input
  private obstructedCopy: string = "Something's in the way — try a clearer spot"

  @input
  private tooSmallCopy: string = "Not enough room here — you need a bit more space"
  @ui.group_end

  private placedEvent: Event<vec3> = new Event<vec3>()
  /** Fires with the floor's world centre once it is confirmed. */
  public readonly onPlaced: PublicApi<vec3> = this.placedEvent.publicApi()

  @input
  @allowUndefined
  @hint(
    "The plate itself, as a control. Pinching it lays the floor. While the spot \
is refused it is held inactive, which both greys it out and makes the pinch do \
nothing — the same gesture stays available, it just will not fire."
  )
  private plateButton: Button

  private camera: WorldCameraFinderProvider
  private sense: SurfaceSense | null = null
  private valid: boolean = false
  private placed: boolean = false
  private started: boolean = false
  private located: boolean = false
  private autoConfirmArmed: boolean = false
  // When the search for a real surface started, as a lens timestamp.
  private waitingSince: number = 0

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    // Enabled partway through the opening, so OnStart alone would not fire.
    this.createEvent("OnStartEvent").bind(() => this.begin())
    this.createEvent("OnEnableEvent").bind(() => this.begin())
    this.createEvent("UpdateEvent").bind(() => this.track())
  }

  private begin(): void {
    if (this.started || !this.camera) {
      return
    }
    this.started = true

    this.sense = new SurfaceSense(this, this.deviceTracking ?? null, this.worldQuery ?? null)
    this.sense.start()

    this.sizePlate()

    if (this.plateButton) {
      // The plate keeps its collider and its pinch, but hands the looks over to
      // the faded surface — the Prism shader has no edge falloff, so its hard
      // rectangle would sit visibly on top of the fade.
      this.plateButton.opacity = 0
      UISoundService.attach(this.plateButton)
      this.plateButton.onTriggerUp.add(() => this.confirm())
      // Starts refused: nothing has been judged yet, and a plate that looks
      // ready before it is would invite a pinch that does nothing.
      this.plateButton.inactive = true
    }
    // ...and the surface has to say so too, or the floor reads as placeable
    // right up until the first verdict lands.
    this.tintSurface(false)
    this.say(this.lookingCopy)

    // Nothing here can see the room at all, so there is nothing to wait for:
    // start the timer already expired and let the plate track the gaze from the
    // first frame.
    const blind = this.sense.source === SurfaceSource.None
    // Blind means there is nothing to wait for, so the clock starts already
    // expired and the plate tracks the gaze from the first frame.
    this.waitingSince = blind ? getTime() - this.fallbackAfter : getTime()
    if (blind) {
      this.followGaze()
    }
  }

  /**
   * Follow the gaze onto the floor.
   *
   * A frame that finds nothing leaves the plate where it was rather than
   * snapping it away — surface results drop out constantly as the head moves,
   * and a plate that flickers between two places is impossible to aim.
   */
  private track(): void {
    if (this.placed || !this.started || !this.sense) {
      return
    }
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back

    const onPlane = this.sense.floorUnderGaze(head, gaze, this.reach)
    if (onPlane) {
      this.settleOn(onPlane, head)
      return
    }

    // No plane under the gaze — either the device has none, or the room is
    // still being explored. Hit testing answers in a frame or two, and its
    // callback resets the timer below when it lands on something.
    const end = head.add(gaze.uniformScale(this.reach))
    this.sense.probe(head, end, (hit) => {
      if (this.placed) {
        return
      }
      const eye = this.camera.getWorldPosition()
      if (!this.isFloor(hit, eye)) {
        // Follow the gaze onto it anyway and refuse it there. Silently ignoring
        // the hit would leave the plate sitting on the last good spot looking
        // perfectly placeable while the dancer stares at a wall.
        this.moveTo(hit.position)
        this.located = true
        this.applyVerdict(FloorVerdict.NotFloor)
        return
      }
      this.settleOn(hit.position, eye)
    })

    // Nothing real has been found for a while, so drive the plate off the gaze
    // instead. This runs every frame rather than once: the plate has to keep
    // following the dancer until they confirm it, and a one-shot placement
    // would freeze it wherever they happened to be looking when the timer ran
    // out. The moment a genuine surface turns up, settleOn resets the clock and
    // this stops.
    //
    // The timer is what decides, not the capability flags — the editor claims
    // plane tracking and scene reconstruction and then delivers neither.
    // Measured against the lens clock rather than by summing frame deltas.
    // Enabling this screen stalls a few frames while its controls build, and
    // those frames report deltas far larger than the time that actually passed
    // — summing them jumped a four second wait in about a tenth of a second.
    if (this.fallbackAfter > 0 && getTime() - this.waitingSince >= this.fallbackAfter) {
      this.followGaze()
    }
  }

  /** Move the plate to a found spot and judge whether it can be danced on. */
  private settleOn(position: vec3, head: vec3): void {
    if (position.y - head.y > this.ceilingGuard) {
      return
    }
    this.moveTo(position)
    this.located = true
    this.waitingSince = getTime()

    const verdict = this.sense.judge(position, this.floorSize * 0.5, this.minFloorFraction)
    this.applyVerdict(verdict)
  }

  /**
   * Unlock or refuse the spot, and say why.
   *
   * `Unknown` is treated as acceptable on purpose: it means nothing on this
   * device could form an opinion, and refusing every spot on a headset that
   * cannot classify rooms would make the lens unusable there.
   */
  private applyVerdict(verdict: FloorVerdict): void {
    switch (verdict) {
      case FloorVerdict.NotFloor:
        this.setValid(false, this.notFloorCopy)
        break
      case FloorVerdict.Obstructed:
        this.setValid(false, this.obstructedCopy)
        break
      case FloorVerdict.TooSmall:
        this.setValid(false, this.tooSmallCopy)
        break
      default:
        this.setValid(true, this.readyCopy)
        break
    }
  }

  /**
   * Is this hit something a person could stand on?
   *
   * Only the hit-test path needs this. Judged by the normal rather than by
   * height: a table top faces up like a floor does, but a wall's normal lies
   * almost flat, which is the case worth refusing.
   */
  private isFloor(hit: WorldQueryHitTestResult, head: vec3): boolean {
    if (hit.normal.y < Math.cos(this.maxTiltDegrees * MathUtils.DegToRad)) {
      return false
    }
    return hit.position.y - head.y <= this.ceilingGuard
  }

  private moveTo(position: vec3): void {
    if (!this.floorRoot) {
      return
    }
    const transform = this.floorRoot.getTransform()
    transform.setWorldPosition(position)

    // Square the plate to the dancer so its label reads the right way up,
    // while keeping it flat on the ground whatever the surface was doing.
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()
    transform.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(-forward.x, -forward.z), 0))
  }

  /** Turn the surface red while a spot is refused, and back when it is not. */
  private tintSurface(valid: boolean): void {
    if (!this.floorSurface) {
      return
    }
    const visual = this.floorSurface.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!visual || !visual.mainPass) {
      return
    }
    // Swapped rather than tinted. Multiplying red over a violet-to-teal sweep
    // muddies both ends of it; a second texture keeps the red a proper light-
    // to-dark gradient of its own, matching the normal one stop for stop.
    const wanted = valid ? this.surfaceTexture : this.refusedTexture
    if (wanted) {
      visual.mainPass.baseTex = wanted
    }
  }

  /**
   * Resize the plate and its lettering to `floorSize`.
   *
   * The plate's geometry lives on its UIKit control rather than on the
   * transform, so scaling the SceneObject would stretch the bevel and the text
   * along with it. Setting `size` rebuilds the mesh and the collider at the
   * right dimensions instead, leaving the hierarchy at scale 1 throughout.
   */
  private sizePlate(): void {
    if (this.floorSize <= 0) {
      return
    }
    if (this.plateButton) {
      // Depth is left as authored — this is a floor, and only its footprint is
      // being described.
      const depth = this.plateButton.size.z
      this.plateButton.size = new vec3(this.floorSize, this.floorSize, depth)
    }

    if (this.floorSurface) {
      // The plane preset's surface lies in its own XZ, with +Y as the normal,
      // so it is turned a quarter-turn in the scene to lie flat on the plate.
      // Scale therefore goes on X and Z; Y is the normal and stays at 1.
      const span = this.floorSize * this.surfaceOversize
      this.floorSurface.getTransform().setLocalScale(new vec3(span, 1, span))
    }

    const ratio = this.designSize > 0 ? this.floorSize / this.designSize : 1
    for (const label of this.labels ?? []) {
      if (!label) {
        continue
      }
      const transform = label.getTransform()
      // Position scales alongside the type: a fixed offset would leave the
      // second line crowding the first on a small plate and adrift on a large
      // one.
      // Only the in-plane offset scales. Z is the hair of clearance that keeps
      // the text off the plate surface, and the plate's depth does not change
      // with its width — scaling that too would sink small floors' lettering
      // into the surface and z-fight.
      const authored = transform.getLocalPosition()
      transform.setLocalPosition(new vec3(authored.x * ratio, authored.y * ratio, authored.z))
      transform.setLocalScale(new vec3(ratio, ratio, ratio))
    }
  }

  /** Hold the plate at arm's length and below eye level, tracking the gaze. */
  private followGaze(): void {
    const head = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    this.moveTo(
      head.add(forward.uniformScale(this.fallbackDistance)).add(new vec3(0, -this.fallbackDrop, 0))
    )
    this.located = true
    this.setValid(true, this.readyCopy)
  }

  private setValid(valid: boolean, copy: string): void {
    this.say(copy)
    if (this.valid === valid) {
      return
    }
    this.valid = valid
    if (valid && this.autoConfirmAfter > 0 && !this.autoConfirmArmed) {
      this.autoConfirmArmed = true
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.confirm())
      timer.reset(this.autoConfirmAfter)
    }
    // `inactive` still gates the pinch even though the plate draws nothing —
    // it is what stops a refused spot from being placed.
    if (this.plateButton) {
      this.plateButton.inactive = !valid
    }
    this.tintSurface(valid)
  }

  private say(copy: string): void {
    if (this.promptText && this.promptText.text !== copy) {
      this.promptText.text = copy
    }
  }

  private confirm(): void {
    if (this.placed || !this.valid || !this.located) {
      return
    }
    this.placed = true

    if (this.sense) {
      this.sense.stop()
    }
    if (this.plateButton) {
      this.plateButton.inactive = true
    }
    // Greying the plate is not enough once the job is done — the placement
    // furniture has to leave, or the dancer is left looking at a control that
    // no longer does anything.
    for (const object of this.hideOnPlaced ?? []) {
      if (object) {
        object.enabled = false
      }
    }

    const centre = this.floorRoot ? this.floorRoot.getTransform().getWorldPosition() : vec3.zero()
    // The floor itself stays: it is the dancer's marked-out area for the rest
    // of the session, not a placement aid to be cleared away.
    if (this.nextScreen) {
      this.nextScreen.enabled = true
    }
    this.placedEvent.invoke(centre)
  }
}
