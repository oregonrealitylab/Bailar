import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {Axis, Grading, StageSpec} from "./Routines"

enum Foot {
  Left,
  Right
}

type FootPiece = {
  visual: RenderMeshVisual
  material: Material
  // Where the print sits, in the guide's floor frame: x is the dancer's right,
  // z runs toward them (so forward is negative, matching the orb).
  x: number
  z: number
  fromX: number
  fromZ: number
  moveStart: number
  moveDuration: number
  // Which way it was last asked to go — a lateral move travels sideways, a
  // sagittal one forward or back.
  flashUntil: number
  flashColor: vec4
}

type Ripple = {
  visual: RenderMeshVisual
  material: Material
  start: number
  color: vec4
}

/** One foot's move on a count: which foot, where it lands, and where the body ends up. */
type FootMove = {
  foot: Foot
  x: number
  z: number
  body: number
}

/**
 * Footprints on the floor that dance the step alongside the orb.
 *
 * The orb shows which way the body travels; this shows which *foot* does it.
 * Two prints sit at the dancer's own feet, and on each count the foot that
 * should move lifts, slides and lands on its new spot — including the close
 * and the tap that the orb has no way to draw, since neither moves the body. A
 * faint ghost marks where the next move will land, so the dancer can see the
 * step coming before the beat arrives.
 *
 * While the attempt is being graded a ring sits under the dancer, blue while
 * they are standing where the pattern says they should be and amber once they
 * have drifted off it, and flashing each step's grade the way the orb does.
 *
 * Driven by the trainer through the same calls as {@link StepGuideOrb}, so the
 * two can never fall out of step with each other.
 */
@component
export class FloorStepGuide extends BaseScriptComponent {
  @input
  @hint("Flat plane mesh lying in XZ, normal +Y. Used for every print and ring.")
  private planeMesh: RenderMesh

  @input
  @hint("Transparent unlit material with Base Texture and Base Color. Cloned per piece.")
  private material: Material

  @input
  private leftFootTexture: Texture

  @input
  private rightFootTexture: Texture

  @input
  @hint("White ring, tinted at run time. Used for the on-mark ring and the landing ripples.")
  private ringTexture: Texture

  @input
  @allowUndefined
  @hint(
    "The dance floor plate laid at the start. Its height is the floor. Without \
it the floor is taken to be Eye Height below the head."
  )
  private floorRoot: SceneObject

  @ui.group_start("Layout")
  @input
  @hint("Used when there is no floor plate: how far below the head the floor is, cm.")
  private eyeHeight: number = 155

  @input
  @hint("Lift off the floor so the prints never z-fight with it, cm.")
  private floorLift: number = 1

  @input
  @hint("How far one step travels, cm. The trainer accepts 15-45.")
  private stride: number = 28

  @input
  @hint("Stride for a march, where every count is a step and each is smaller, cm.")
  private marchStride: number = 18

  @input
  @hint("Centre-to-centre gap between the feet when they are together, cm.")
  private stanceWidth: number = 16

  @input
  @hint("Length of a print, cm.")
  private footLength: number = 26

  @input
  @hint(
    "Shift the whole guide forward of the dancer's feet, cm. 0 puts the prints \
right under them."
  )
  private forwardOffset: number = 0
  @ui.group_end

  @ui.group_start("Look")
  @input
  @hint("Opacity of the foot that just moved, or is about to.")
  @widget(new SliderWidget(0, 1, 0.05))
  private activeAlpha: number = 0.9

  @input
  @hint("Opacity of the foot that is standing still.")
  @widget(new SliderWidget(0, 1, 0.05))
  private restingAlpha: number = 0.45

  @input
  @hint("Opacity of the ghost that marks where the next move lands.")
  @widget(new SliderWidget(0, 1, 0.05))
  private ghostAlpha: number = 0.22

  @input
  @hint("How high a foot lifts while it travels, cm.")
  private liftHeight: number = 3

  @input
  @hint("Share of a beat spent travelling. Matches the orb so both land together.")
  @widget(new SliderWidget(0.2, 1, 0.05))
  private travelFraction: number = 0.55

  @input
  @hint("Seconds a landing ripple takes to spread and fade.")
  private rippleDuration: number = 0.6

  @input
  @widget(new ColorWidget())
  private rippleColor: vec4 = new vec4(0.55, 0.6, 1, 1)

  @input
  @hint("On-mark ring colour while the dancer is where the pattern expects.")
  @widget(new ColorWidget())
  private onMarkColor: vec4 = new vec4(0.35, 0.7, 1, 1)

  @input
  @hint("On-mark ring colour once the dancer has drifted off the pattern.")
  @widget(new ColorWidget())
  private offMarkColor: vec4 = new vec4(1, 0.7, 0.25, 1)

  @input
  @hint("How far from where the pattern expects still counts as on the mark, as a share of a stride.")
  @widget(new SliderWidget(0.2, 1.5, 0.05))
  private markTolerance: number = 0.6

  @input
  @hint("Seconds a step's grade colour is held on the ring and the print.")
  private accuracyHold: number = 0.9
  @ui.group_end

  private camera: WorldCameraFinderProvider
  private built: boolean = false
  private root: SceneObject | null = null
  private feet: FootPiece[] = []
  private ghost: {visual: RenderMeshVisual; material: Material; foot: Foot} | null = null
  private ring: {visual: RenderMeshVisual; material: Material} | null = null
  private ripples: Ripple[] = []

  private stage: StageSpec | null = null
  private mirrored: boolean = false
  private assessing: boolean = false
  // Where the body is meant to be, in steps from the stage's start spot.
  private body: number = 0
  private lastFoot: Foot = Foot.Right
  // The foot that made the last real step, as opposed to a close. Grades
  // arrive after the step has settled, by which time the close may already
  // have moved the other foot.
  private stepFoot: Foot = Foot.Left
  private lastCount: number = 0
  private lastStepCount: number = -1
  private beatPeriod: number = 0.5

  private anchor: vec3 = vec3.zero()
  private yaw: quat = quat.quatIdentity()
  private right: vec3 = vec3.right()
  private forward: vec3 = vec3.back()
  private anchored: boolean = false

  private markBlend: number = 1
  private ringFlashUntil: number = -1
  private ringFlashColor: vec4 = new vec4(1, 1, 1, 1)

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("OnEnableEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  // ─── Calls from the trainer, mirroring StepGuideOrb ──────────────────────

  /**
   * Anchor the prints at the dancer's feet, squared up to where they face.
   *
   * Takes the same head-and-gaze pair as the orb so the trainer can place both
   * from the same moment.
   */
  public place(head: vec3, gaze: vec3): void {
    const flat = new vec3(gaze.x, 0, gaze.z)
    this.forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()
    this.right = this.forward.cross(vec3.up()).normalize()
    this.yaw = quat.fromEulerAngles(0, Math.atan2(-this.forward.x, -this.forward.z), 0)
    this.anchorAt(head)
  }

  public show(visible: boolean): void {
    this.build()
    if (this.root) {
      this.root.enabled = visible
    }
    if (!visible) {
      this.setAssessing(false)
    }
  }

  /**
   * Start a stage over from feet together, wherever the dancer now stands.
   *
   * Re-anchored here rather than only at placement: each stage (and each Watch
   * Again) starts from a standstill, and a guide left where the last stage
   * finished would ask for the first step from the wrong spot.
   */
  public setStage(stage: StageSpec): void {
    this.build()
    this.stage = stage
    this.body = 0
    this.lastFoot = Foot.Right
    this.lastCount = 0
    this.lastStepCount = -1
    if (this.anchored) {
      this.anchorAt(this.camera.getWorldPosition())
    }
    const half = this.stanceWidth * 0.5
    this.setFoot(Foot.Left, -half, 0)
    this.setFoot(Foot.Right, half, 0)
    this.updateGhost()
  }

  public setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored
    this.updateGhost()
  }

  /** On while the attempt is graded: shows the ring under the dancer. */
  public setAssessing(assessing: boolean): void {
    this.assessing = assessing
    this.markBlend = 1
    if (this.ring) {
      this.ring.visual.enabled = assessing
    }
  }

  /** Take one count: move whichever foot the pattern moves on it. */
  public onCount(count: number, stage: StageSpec, beatPeriod: number, now: number): void {
    if (this.stage !== stage) {
      this.setStage(stage)
    }
    this.beatPeriod = beatPeriod
    const move = this.moveFor(count)
    this.lastCount = count
    if (move) {
      if (stage.steps.some((step) => step.count === count)) {
        this.lastStepCount = count
        this.stepFoot = move.foot
      }
      this.body = move.body
      this.lastFoot = move.foot
      this.startMove(move, now)
    }
    this.updateGhost()
  }

  /** Flash the step's grade on the ring and on the foot that just landed. */
  public setAccuracy(color: vec4): void {
    const until = getTime() + this.accuracyHold
    this.ringFlashColor = color
    this.ringFlashUntil = until
    const piece = this.feet[this.stepFoot]
    if (piece) {
      piece.flashColor = color
      piece.flashUntil = until
    }
  }

  // ─── The pattern, foot by foot ────────────────────────────────────────────

  /**
   * Work out what happens on `count` without changing anything, so the same
   * rule drives both the move and the ghost that previews it.
   *
   * A count with a step moves one foot and carries the body a stride. A count
   * without one, straight after a step, is the close (or the tap): the other
   * foot comes in beside the one that just stepped. Anything else is a hold.
   */
  private moveFor(count: number): FootMove | null {
    const stage = this.stage
    if (!stage) {
      return null
    }
    const half = this.stanceWidth * 0.5
    const stride = this.strideFor(stage)
    const step = stage.steps.find((candidate) => candidate.count === count)

    if (step) {
      const direction = this.mirrored ? -step.direction : step.direction
      const body = this.body + direction
      const foot = this.footFor(direction, count, stage)
      if (stage.axis === Axis.Lateral) {
        return {foot, x: body * stride + this.side(foot) * half, z: this.feet[foot].z, body}
      }
      return {foot, x: this.feet[foot].x, z: -body * stride, body}
    }

    const previous = count === 1 ? 8 : count - 1
    const closes = stage.grading !== Grading.Beat && this.lastStepCount === previous
    if (!closes) {
      return null
    }
    const foot = this.lastFoot === Foot.Left ? Foot.Right : Foot.Left
    if (stage.axis === Axis.Lateral) {
      return {foot, x: this.body * stride + this.side(foot) * half, z: this.feet[foot].z, body: this.body}
    }
    return {foot, x: this.feet[foot].x, z: -this.body * stride, body: this.body}
  }

  /**
   * Which foot carries a step.
   *
   * Sideways, it is the foot on the side being travelled to. Forward and back
   * in a step-and-hold basic, the left leads forward and the right leads back;
   * in a march the feet simply alternate, left on the odd counts.
   */
  private footFor(direction: number, count: number, stage: StageSpec): Foot {
    if (stage.axis === Axis.Lateral) {
      return direction < 0 ? Foot.Left : Foot.Right
    }
    if (stage.grading === Grading.Beat) {
      return count % 2 === 1 ? Foot.Left : Foot.Right
    }
    return direction > 0 ? Foot.Left : Foot.Right
  }

  private strideFor(stage: StageSpec): number {
    return stage.grading === Grading.Beat ? this.marchStride : this.stride
  }

  private side(foot: Foot): number {
    return foot === Foot.Left ? -1 : 1
  }

  /** The first count after the last one with a move on it, looked up to a bar ahead. */
  private nextMove(): FootMove | null {
    for (let i = 1; i <= 8; i++) {
      const count = ((this.lastCount + i - 1) % 8) + 1
      const move = this.moveFor(count)
      if (move) {
        return move
      }
    }
    return null
  }

  // ─── Building and drawing ────────────────────────────────────────────────

  private build(): void {
    if (this.built || !this.planeMesh || !this.material) {
      return
    }
    this.built = true

    this.root = global.scene.createSceneObject("FloorGuide")
    this.root.setParent(this.sceneObject)

    for (const foot of [Foot.Left, Foot.Right]) {
      const texture = foot === Foot.Left ? this.leftFootTexture : this.rightFootTexture
      const made = this.makePlane(foot === Foot.Left ? "LeftFoot" : "RightFoot", texture)
      this.feet[foot] = {
        visual: made.visual,
        material: made.material,
        x: 0,
        z: 0,
        fromX: 0,
        fromZ: 0,
        moveStart: -1,
        moveDuration: 0.25,
        flashUntil: -1,
        flashColor: new vec4(1, 1, 1, 1)
      }
    }

    const ghost = this.makePlane("NextStep", this.leftFootTexture)
    this.ghost = {visual: ghost.visual, material: ghost.material, foot: Foot.Left}

    const ring = this.makePlane("OnMark", this.ringTexture)
    this.ring = ring
    ring.visual.enabled = this.assessing

    this.show(false)
  }

  private makePlane(name: string, texture: Texture): {visual: RenderMeshVisual; material: Material} {
    const object = global.scene.createSceneObject(name)
    object.setParent(this.root)
    const visual = object.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = this.planeMesh
    // Cloned per piece: every print fades and tints on its own.
    const material = this.material.clone()
    if (texture) {
      material.mainPass.baseTex = texture
    }
    material.mainPass.baseColor = new vec4(1, 1, 1, 1)
    visual.mainMaterial = material
    return {visual, material}
  }

  private anchorAt(head: vec3): void {
    // Trust the plate only once it has actually been laid and sits plausibly
    // below the head: an unplaced plate is still at its authored spot, which
    // can be anywhere, including level with the eyes.
    let floorY = head.y - this.eyeHeight
    if (this.floorRoot && this.floorRoot.isEnabledInHierarchy) {
      const plateY = this.floorRoot.getTransform().getWorldPosition().y
      if (head.y - plateY > 50) {
        floorY = plateY
      }
    }
    const feet = new vec3(head.x, floorY + this.floorLift, head.z).add(this.forward.uniformScale(this.forwardOffset))
    this.anchor = feet
    this.anchored = true
    const transform = this.getTransform()
    transform.setWorldPosition(feet)
    transform.setWorldRotation(this.yaw)
  }

  private setFoot(foot: Foot, x: number, z: number): void {
    const piece = this.feet[foot]
    if (!piece) {
      return
    }
    piece.x = x
    piece.z = z
    piece.fromX = x
    piece.fromZ = z
    piece.moveStart = -1
  }

  private startMove(move: FootMove, now: number): void {
    const piece = this.feet[move.foot]
    if (!piece) {
      return
    }
    piece.fromX = this.currentX(piece, now)
    piece.fromZ = this.currentZ(piece, now)
    piece.x = move.x
    piece.z = move.z
    piece.moveStart = now
    piece.moveDuration = Math.max(0.05, this.beatPeriod * this.travelFraction)
  }

  private progress(piece: FootPiece, now: number): number {
    if (piece.moveStart < 0) {
      return 1
    }
    return Math.min(1, (now - piece.moveStart) / piece.moveDuration)
  }

  /** Quick start, soft landing — reads as a step rather than a slide. */
  private ease(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  private currentX(piece: FootPiece, now: number): number {
    return piece.fromX + (piece.x - piece.fromX) * this.ease(this.progress(piece, now))
  }

  private currentZ(piece: FootPiece, now: number): number {
    return piece.fromZ + (piece.z - piece.fromZ) * this.ease(this.progress(piece, now))
  }

  private updateGhost(): void {
    if (!this.ghost) {
      return
    }
    const next = this.stage ? this.nextMove() : null
    this.ghost.visual.enabled = !!next
    if (!next) {
      return
    }
    if (this.ghost.foot !== next.foot) {
      this.ghost.foot = next.foot
      this.ghost.material.mainPass.baseTex = next.foot === Foot.Left ? this.leftFootTexture : this.rightFootTexture
    }
    this.placePiece(this.ghost.visual, next.x, 0, next.z, 1)
  }

  private placePiece(visual: RenderMeshVisual, x: number, y: number, z: number, scale: number): void {
    const transform = visual.getSceneObject().getTransform()
    transform.setLocalPosition(new vec3(x, y, z))
    // Prints are twice as long as they are wide, matching their textures.
    transform.setLocalScale(new vec3(this.footLength * 0.5 * scale, 1, this.footLength * scale))
  }

  private spawnRipple(x: number, z: number, color: vec4): void {
    if (!this.root) {
      return
    }
    const made = this.makePlane("Ripple", this.ringTexture)
    made.visual.getSceneObject().getTransform().setLocalPosition(new vec3(x, 0.2, z))
    this.ripples.push({visual: made.visual, material: made.material, start: getTime(), color})
  }

  private tick(): void {
    if (!this.built || !this.root || !this.root.enabled) {
      return
    }
    const now = getTime()
    this.drawFeet(now)
    this.drawRing(now)
    this.drawRipples(now)
  }

  private drawFeet(now: number): void {
    for (const foot of [Foot.Left, Foot.Right]) {
      const piece = this.feet[foot]
      const t = this.progress(piece, now)
      const moving = piece.moveStart >= 0
      const lift = moving ? Math.sin(t * Math.PI) * this.liftHeight : 0
      this.placePiece(piece.visual, this.currentX(piece, now), lift, this.currentZ(piece, now), 1 + lift * 0.02)

      if (moving && t >= 1) {
        piece.moveStart = -1
        this.spawnRipple(piece.x, piece.z, this.rippleColor)
      }

      const active = foot === this.lastFoot
      const alpha = active ? this.activeAlpha : this.restingAlpha
      const color = piece.flashUntil > now ? piece.flashColor : new vec4(1, 1, 1, 1)
      piece.material.mainPass.baseColor = new vec4(color.x, color.y, color.z, alpha)
    }
    if (this.ghost) {
      // A slow breath, so the ghost reads as a suggestion rather than a print.
      const breath = 0.75 + 0.25 * Math.sin(now * Math.PI * 2 * 0.8)
      this.ghost.material.mainPass.baseColor = new vec4(1, 1, 1, this.ghostAlpha * breath)
    }
  }

  /**
   * The ring under the dancer, coloured by whether they are on the mark.
   *
   * Measured from the head projected onto the floor, against the spot the
   * pattern has the body on right now. The colour eases between the two states
   * rather than snapping, so a dancer who is a beat behind sees it cool and
   * warm instead of flicker.
   */
  private drawRing(now: number): void {
    if (!this.ring || !this.assessing || !this.stage) {
      return
    }
    const head = this.camera.getWorldPosition()
    const offset = new vec3(head.x - this.anchor.x, 0, head.z - this.anchor.z)
    const along = offset.dot(this.right)
    // The guide may sit ahead of the dancer's feet; measure from where they
    // started, and draw the ring on the guide as their stand-in.
    const ahead = offset.dot(this.forward) + this.forwardOffset

    const stride = this.strideFor(this.stage)
    const expectedX = this.stage.axis === Axis.Lateral ? this.body * stride : 0
    const expectedAhead = this.stage.axis === Axis.Sagittal ? this.body * stride : 0
    const miss = Math.sqrt(Math.pow(along - expectedX, 2) + Math.pow(ahead - expectedAhead, 2))
    // Judged against the longer stride either way: a march step is small, and
    // a tolerance scaled to it would call a dancer off the mark for swaying.
    const onMark = miss <= this.stride * this.markTolerance

    this.markBlend += ((onMark ? 1 : 0) - this.markBlend) * Math.min(1, getDeltaTime() * 6)
    let color = new vec4(
      this.offMarkColor.x + (this.onMarkColor.x - this.offMarkColor.x) * this.markBlend,
      this.offMarkColor.y + (this.onMarkColor.y - this.offMarkColor.y) * this.markBlend,
      this.offMarkColor.z + (this.onMarkColor.z - this.offMarkColor.z) * this.markBlend,
      0.75
    )
    if (this.ringFlashUntil > now) {
      color = new vec4(this.ringFlashColor.x, this.ringFlashColor.y, this.ringFlashColor.z, 0.9)
    }
    this.ring.material.mainPass.baseColor = color

    const size = this.stanceWidth + this.footLength * 0.9
    const transform = this.ring.visual.getSceneObject().getTransform()
    transform.setLocalPosition(new vec3(along, 0.1, -ahead))
    transform.setLocalScale(new vec3(size, 1, size))
  }

  private drawRipples(now: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]
      const t = (now - ripple.start) / this.rippleDuration
      if (t >= 1) {
        ripple.visual.getSceneObject().destroy()
        this.ripples.splice(i, 1)
        continue
      }
      const size = this.footLength * (0.6 + t * 0.9)
      ripple.visual.getSceneObject().getTransform().setLocalScale(new vec3(size, 1, size))
      ripple.material.mainPass.baseColor = new vec4(ripple.color.x, ripple.color.y, ripple.color.z, 0.7 * (1 - t))
    }
  }
}
