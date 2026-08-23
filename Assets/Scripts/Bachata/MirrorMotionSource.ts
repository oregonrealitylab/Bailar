import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/**
 * Reads the dancer's travel from a body tracker instead of from head position.
 *
 * Mirror Mode assumes the dancer is facing a mirror, so the camera on their
 * head sees their reflection and a body tracker can lock onto it. What comes
 * back is deliberately measured *relative to the head*, not in world space:
 * mirroring only flips the axis perpendicular to the glass, so a reflection
 * travels sideways exactly in step with the person it belongs to. Subtracting
 * the head cancels that shared motion and leaves the part worth scoring — how
 * far the hips swing out from under the shoulders, which is what a bachata
 * basic actually looks like from the front.
 *
 * The signal is handed back as a synthetic world position (head + offset) so
 * the rest of the trainer keeps working in the units it already expects.
 */
@component
export class MirrorMotionSource extends BaseScriptComponent {
  @input
  @hint("Object Tracking 3D component driving a Body Tracking asset.")
  private bodyTracking: ObjectTracking3D

  @input
  @allowUndefined
  @hint(
    "Object already attached to a hip/pelvis joint in the Inspector. Leave \
empty to have the joints below attached at run time instead."
  )
  private trackedJoint: SceneObject

  @ui.group_start("Joints")
  @input
  @hint("Attachment point used when no Tracked Joint is supplied.")
  private jointName: string = "Left Hip"

  @input
  @allowUndefined
  @hint("Optional second joint. Averaged with the first, which steadies the centre line.")
  private secondJointName: string = "Right Hip"
  @ui.group_end

  @input
  @hint(
    "Scales tracked offset into the metre range the step thresholds expect. A \
reflection sits at twice the distance to the glass, so raw offsets read large; \
lower this if steps register early."
  )
  @widget(new SliderWidget(0.1, 3.0, 0.05))
  private gain: number = 0.5

  private camera: WorldCameraFinderProvider
  private joints: SceneObject[] = []
  private attached: boolean = false

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    this.createEvent("OnStartEvent").bind(() => this.attach())
  }

  /** True once a body is actually locked on, not merely once the asset exists. */
  public get available(): boolean {
    if (!this.bodyTracking || !this.bodyTracking.isTracking()) {
      return false
    }
    return this.joints.length > 0
  }

  private attach(): void {
    if (this.attached) {
      return
    }
    this.attached = true

    if (this.trackedJoint) {
      // Hand-wired in the Inspector, which is the only way to be certain the
      // joint name matches whichever body asset is in use.
      this.joints.push(this.trackedJoint)
      return
    }
    if (!this.bodyTracking) {
      return
    }
    for (const name of [this.jointName, this.secondJointName]) {
      if (!name) {
        continue
      }
      const point = this.bodyTracking.createAttachmentPoint(name)
      if (point) {
        this.joints.push(point)
      }
    }
  }

  /**
   * Where the trainer should treat the dancer as standing, in world
   * centimetres. Falls back to the head whenever the body is not tracked, so a
   * dropout freezes the signal rather than throwing the step detector a spike.
   */
  public getPosition(): vec3 {
    const head = this.camera.getWorldPosition()
    if (!this.available) {
      return head
    }
    return head.add(this.jointCentre().sub(head).uniformScale(this.gain))
  }

  /**
   * Averaging the hips keeps the reference on the body's centre line. A single
   * hip swings with every step, which would read as travel the dancer never
   * made — and in a mirror the tracker's left/right labels are reversed, so a
   * centre point also sidesteps having to care which hip is which.
   */
  private jointCentre(): vec3 {
    let sum = vec3.zero()
    for (const joint of this.joints) {
      sum = sum.add(joint.getTransform().getWorldPosition())
    }
    return sum.uniformScale(1 / this.joints.length)
  }
}
