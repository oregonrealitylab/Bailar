import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {DragInteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {TargetingMode} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"

/**
 * Trackball spin for the globe.
 *
 * Pinch anywhere on the sphere and drag: the globe turns with your hand while
 * you hold, and coasts when you let go. Rotation is locked to the spin root's
 * own Y axis, so the globe only ever turns like a turntable — its poles stay
 * upright and its position is never touched.
 *
 * The globe builds its own sphere collider and SIK Interactable at run time
 * rather than borrowing a UI element's. A Button's collider is a flat box, so
 * pinching only landed on a disc facing the viewer; a sphere collider means
 * the grab works anywhere on the globe, including near the limb.
 */
@component
export class GlobeSpinner extends BaseScriptComponent {
  @input
  @hint("The object actually rotated, and the one the collider is built on.")
  private spinTarget: SceneObject

  @input
  @hint("Radius of the grab sphere, cm. Should match the globe's visible radius.")
  private grabRadius: number = 25

  @input
  @hint("Degrees of spin per centimetre of hand movement.")
  @widget(new SliderWidget(0.5, 20, 0.25))
  private sensitivity: number = 6

  @input
  @hint("How much spin carries on after release. 0 stops dead, 0.97 coasts a long way.")
  @widget(new SliderWidget(0, 0.99, 0.01))
  private momentum: number = 0.92

  @input
  @hint("Degrees per second of idle drift when untouched. 0 holds still.")
  private idleSpin: number = 3

  private interactable: Interactable | null = null
  private dragging: boolean = false

  // Rotation asked for by the hand since the last frame, in degrees.
  private pendingYaw: number = 0
  // Carried after release, in degrees per second.
  private velocityYaw: number = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    const target = this.spinTarget ?? this.getSceneObject()

    // A sphere collider sized to the globe, so the whole ball is grabbable.
    const collider = target.createComponent("ColliderComponent")
    collider.fitVisual = false
    const shape = Shape.createSphereShape()
    shape.radius = this.grabRadius
    collider.shape = shape

    this.interactable = target.createComponent(Interactable.getTypeName()) as Interactable
    this.interactable.targetingMode = TargetingMode.All
    // Start dragging on the pinch itself rather than after a threshold — the
    // globe should answer the first millimetre of hand movement.
    this.interactable.enableInstantDrag = true

    this.interactable.onDragStart.add(() => {
      this.dragging = true
      this.velocityYaw = 0
    })
    this.interactable.onDragUpdate.add((event: DragInteractorEvent) => this.onDrag(event))
    this.interactable.onDragEnd.add(() => {
      this.dragging = false
    })
  }

  /**
   * Accumulate this frame's hand movement as rotation to apply.
   *
   * `dragVector` is the hand's movement since the previous drag event, so it
   * is a delta, not a rate — it has to be applied once and cleared. Treating
   * it as a velocity makes the globe keep spinning while the hand is held
   * still, which is the opposite of direct manipulation.
   */
  private onDrag(event: DragInteractorEvent): void {
    if (!event.dragVector) {
      return
    }
    // Only the sideways component is read. Vertical hand movement is ignored
    // outright rather than being folded in, so the globe can never pick up a
    // tilt it has no way to correct.
    const view = this.getSceneObject().getTransform()
    const horizontal = event.dragVector.dot(view.right)

    this.pendingYaw += -horizontal * this.sensitivity
  }

  private onUpdate(): void {
    const target = this.spinTarget ?? this.getSceneObject()
    const dt = getDeltaTime()

    let yaw = 0

    if (this.dragging) {
      // Apply exactly what the hand asked for this frame, then clear it, so
      // the globe tracks one-to-one and stops the moment the hand stops.
      yaw = this.pendingYaw
      this.pendingYaw = 0

      // Remember the rate for the throw, so releasing mid-swipe keeps going.
      if (dt > 0) {
        this.velocityYaw = yaw / dt
      }
    } else {
      this.velocityYaw *= this.momentum
      // Settle into a slow idle turn once the throw has died away.
      this.velocityYaw += (this.idleSpin - this.velocityYaw) * 0.01
      yaw = this.velocityYaw * dt
    }

    if (Math.abs(yaw) < 1e-5) {
      return
    }

    const transform = target.getTransform()

    // Spin about the target's own up axis. Composing on the inside of the
    // current rotation keeps this a pure local-Y turn, so no amount of
    // spinning can introduce pitch or roll.
    const step = quat.angleAxis((yaw * Math.PI) / 180, vec3.up())
    transform.setWorldRotation(transform.getWorldRotation().multiply(step))
  }
}
