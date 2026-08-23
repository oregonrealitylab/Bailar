import {Axis, StageSpec} from "./Routines"

/**
 * A glowing orb that dances the step before the dancer does.
 *
 * It floats at arm's length in front of the viewer and travels the way the next
 * step travels — left on the 1, holding on the 2, left again on the 3 — so the
 * routine can be followed by watching one moving object rather than by reading
 * a prompt and converting it into a direction. Its colour reports how the last
 * step was graded.
 *
 * Built from primitives at run time rather than authored: the shells and the
 * swirl are all the same sphere at different scales and alphas, and generating
 * them keeps their count and spacing on the Inspector instead of in a prefab
 * that would have to be rebuilt by hand every time one number changes.
 */
@component
export class StepGuideOrb extends BaseScriptComponent {
  @input
  @hint("Sphere mesh used for the orb, its glow shells and every particle.")
  private sphereMesh: RenderMesh

  @input
  @hint("Unlit material for the solid core and the swirl. Cloned per piece.")
  private baseMaterial: Material

  @input
  @hint(
    "Material for the glow shells. Wants additive blending with depth writing \
off, or the shells occlude each other and the orb reads as a flat blob."
  )
  private glowMaterial: Material

  @ui.group_start("Placement")
  @input
  @hint("How far in front of the dancer the orb floats, cm.")
  private distance: number = 60

  @input
  @hint("Height relative to eye level, cm. 0 is dead ahead.")
  private heightOffset: number = 0

  @input
  @hint("How far the orb travels per step, cm.")
  private stepDistance: number = 18
  @ui.group_end

  @ui.group_start("Orb")
  @input
  @hint("Radius of the solid core, cm.")
  private coreRadius: number = 3

  @input
  @hint("How many glow shells surround the core. Each is larger and fainter.")
  private glowShells: number = 3

  @input
  @hint("Scale of the outermost shell, as a multiple of the core.")
  @widget(new SliderWidget(1.1, 4, 0.1))
  private glowSpread: number = 2.4

  @input
  @hint("Opacity of the innermost shell. The rest fall away from it.")
  @widget(new SliderWidget(0.05, 1, 0.05))
  private glowStrength: number = 0.4
  @ui.group_end

  @ui.group_start("Swirl")
  @input
  private particleCount: number = 26

  @input
  @hint("How far the swirl sits off the core's surface, as a multiple of its radius.")
  @widget(new SliderWidget(1, 2.5, 0.05))
  private swirlRadius: number = 1.35

  @input
  @hint("Particle size as a fraction of the core.")
  @widget(new SliderWidget(0.02, 0.4, 0.01))
  private particleScale: number = 0.12

  @input
  @hint("Turns per second of the swirl.")
  @widget(new SliderWidget(0.05, 3, 0.05))
  private swirlSpeed: number = 0.55

  @input
  @widget(new ColorWidget())
  private swirlColorA: vec4 = new vec4(0.35, 0.95, 0.7, 1)

  @input
  @widget(new ColorWidget())
  private swirlColorB: vec4 = new vec4(0.6, 0.35, 0.95, 1)
  @ui.group_end

  @input
  @hint("Colour before the first step of a set is graded.")
  @widget(new ColorWidget())
  private idleColor: vec4 = new vec4(0.24, 0.78, 0.62, 1)

  @ui.group_start("Motion")
  @input
  @hint("Share of a beat spent travelling. The rest of the beat is the hold.")
  @widget(new SliderWidget(0.2, 1, 0.05))
  private travelFraction: number = 0.55

  @input
  @hint(
    "How far the orb overshoots its mark before settling back. 0 is a plain \
glide; higher values give the burst-and-settle that reads as a step landing."
  )
  @widget(new SliderWidget(0, 2, 0.05))
  private overshoot: number = 0.9

  @input
  @hint("How far the orb bobs up and down, cm.")
  @widget(new SliderWidget(0, 4, 0.1))
  private hoverAmplitude: number = 0.9

  @input
  @hint("Bobs per second.")
  @widget(new SliderWidget(0.05, 2, 0.05))
  private hoverSpeed: number = 0.4

  @input
  @hint("Smallest the orb shrinks to while breathing, as a fraction of full size.")
  @widget(new SliderWidget(0.5, 1, 0.05))
  private pulseMin: number = 0.8

  @input
  @hint("Breaths per second.")
  @widget(new SliderWidget(0.05, 2, 0.05))
  private pulseSpeed: number = 0.5
  @ui.group_end

  @input
  @hint(
    "Seconds a graded colour is held before the orb settles back to neutral. \
The colour is a reaction to one step, not a running score."
  )
  @widget(new SliderWidget(0.1, 3, 0.1))
  private accuracyHold: number = 0.9

  private root: SceneObject | null = null
  private core: RenderMeshVisual | null = null
  private coreMaterial: Material | null = null
  private shells: Material[] = []
  private particles: {object: SceneObject; phase: number; tilt: number; drift: number}[] = []

  private axis: Axis = Axis.Lateral
  private offset: number = 0
  private travelFrom: number = 0
  private travelTo: number = 0
  private travelStart: number = -1
  private mirrored: boolean = false
  // Where the orb was anchored at placement. The follow works out from here
  // rather than from the orb's current position, which is already carrying the
  // step travel.
  private anchor: vec3 = vec3.zero()
  private anchored: boolean = false
  private travelDuration: number = 0.25
  private built: boolean = false
  private accuracyUntil: number = -1

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("OnEnableEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  private build(): void {
    if (this.built || !this.sphereMesh || !this.baseMaterial || !this.glowMaterial) {
      return
    }
    this.built = true

    // Everything hangs off a child of this object so the orb can be slid along
    // its travel axis without disturbing where the whole rig was anchored.
    this.root = global.scene.createSceneObject("Orb")
    this.root.setParent(this.sceneObject)

    this.core = this.makeSphere(this.root, "Core", this.coreRadius, new vec4(1, 1, 1, 1))
    this.coreMaterial = this.core.mainMaterial

    for (let i = 0; i < this.glowShells; i++) {
      // Each shell steps out toward the spread and fades as it goes, so the
      // stack reads as one soft halo rather than as separate bubbles.
      const t = this.glowShells <= 1 ? 1 : (i + 1) / this.glowShells
      const radius = this.coreRadius * (1 + (this.glowSpread - 1) * t)
      const alpha = this.glowStrength * (1 - t * 0.75)
      const shell = this.makeSphere(this.root, "Glow" + i, radius, new vec4(1, 1, 1, alpha), this.glowMaterial)
      this.shells.push(shell.mainMaterial)
    }

    this.buildSwirl()
    // Idle colour before the first step is graded. Saturated on purpose: the
    // additive shells pile on top of the core, so a pale core saturates to a
    // flat white disc and the halo stops reading as a halo.
    this.paint(this.idleColor)
    this.show(false)
  }

  /**
   * Scatter the swirl over the sphere rather than round one belt.
   *
   * Each particle keeps its own tilt and its own small speed difference, so the
   * cloud never resolves into a single ring — that difference is what makes it
   * read as a swirl instead of an orbit.
   */
  private buildSwirl(): void {
    if (!this.root) {
      return
    }
    const size = this.coreRadius * this.particleScale

    for (let i = 0; i < this.particleCount; i++) {
      const t = this.particleCount <= 1 ? 0 : i / (this.particleCount - 1)
      const color = new vec4(
        this.swirlColorA.x + (this.swirlColorB.x - this.swirlColorA.x) * t,
        this.swirlColorA.y + (this.swirlColorB.y - this.swirlColorA.y) * t,
        this.swirlColorA.z + (this.swirlColorB.z - this.swirlColorA.z) * t,
        1
      )
      const visual = this.makeSphere(this.root, "Swirl" + i, size, color)

      // Spread by the golden angle so successive particles never line up, and
      // vary the speed a little so the pattern keeps shifting.
      this.particles.push({
        object: visual.getSceneObject(),
        phase: i * 2.39996,
        tilt: (i / Math.max(1, this.particleCount)) * Math.PI - Math.PI * 0.5,
        drift: 0.7 + ((i * 37) % 60) / 100
      })
    }
  }

  private makeSphere(
    parent: SceneObject,
    name: string,
    radius: number,
    color: vec4,
    source?: Material
  ): RenderMeshVisual {
    const object = global.scene.createSceneObject(name)
    object.setParent(parent)
    object.getTransform().setLocalScale(vec3.one().uniformScale(radius))

    const visual = object.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = this.sphereMesh
    // Cloned per piece: the core recolours on every verdict, and a shared
    // material would drag the whole swirl along with it.
    const material = (source ?? this.baseMaterial).clone()
    material.mainPass.baseColor = color
    visual.mainMaterial = material
    return visual
  }

  /** Anchor the orb in front of the dancer, facing them. */
  public place(head: vec3, gaze: vec3): void {
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    const transform = this.getTransform()
    this.anchor = head
      .add(forward.uniformScale(this.distance))
      .add(new vec3(0, this.heightOffset, 0))
    this.anchored = true
    transform.setWorldPosition(this.anchor)
    // Same yaw the panels use, which puts local +X on the dancer's right and
    // local -Z straight away from them — the two directions a step travels.
    transform.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(-forward.x, -forward.z), 0))

    this.offset = 0
    this.travelFrom = 0
    this.travelTo = 0
    this.travelStart = -1
    this.apply()
  }

  /**
   * Track the dancer as they travel, exactly as the coach panel does.
   *
   * The offsets are the panel's own, already smoothed, so the orb cannot drift
   * out of step with it or lag by a different amount — the two move as one
   * piece. Height is untouched: this follows where the dancer *is*, not where
   * they are looking, so glancing up or down leaves the orb where it was.
   */
  public follow(right: vec3, forward: vec3, offsetRight: number, offsetForward: number): void {
    if (!this.anchored) {
      return
    }
    const position = this.anchor
      .add(right.uniformScale(offsetRight))
      .add(forward.uniformScale(offsetForward))
    this.getTransform().setWorldPosition(position)
  }

  public show(visible: boolean): void {
    if (this.root) {
      this.root.enabled = visible
    }
  }

  /** Tell the orb which way the stage travels before its first count. */
  /**
   * Flip which way the pattern runs.
   *
   * Used to demonstrate a basic on both sides: run the bar as written, then
   * run it mirrored, and the orb ends up back where it started having shown
   * the step in each direction. Grading never uses this — the dancer is asked
   * for the pattern as the routine writes it.
   */
  public setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored
  }

  public setStage(stage: StageSpec): void {
    this.axis = stage.axis
    this.offset = 0
    this.travelFrom = 0
    this.travelTo = 0
    this.travelStart = -1
    this.apply()
  }

  /**
   * Take one count.
   *
   * A count that carries a step sends the orb one step further along; a count
   * that does not leaves it where it is, which is what draws the hold. The
   * travel is deliberately shorter than the beat so the arrival is visible —
   * an orb still gliding as the next count lands teaches the wrong rhythm.
   */
  public onCount(count: number, stage: StageSpec, beatPeriod: number, now: number): void {
    const step = stage.steps.find((candidate) => candidate.count === count)
    if (!step) {
      return
    }
    const direction = this.mirrored ? -step.direction : step.direction
    this.travelFrom = this.offset
    this.travelTo = this.offset + direction
    this.travelStart = now
    this.travelDuration = Math.max(0.05, beatPeriod * this.travelFraction)
  }

  /**
   * Flash the orb in a step's grade, then let it fall back to neutral.
   *
   * Held rather than latched: the colour answers the step that was just taken,
   * so leaving it up would let a single bad step tint the whole set.
   */
  public setAccuracy(color: vec4): void {
    this.paint(color)
    this.accuracyUntil = getTime() + this.accuracyHold
  }

  private paint(color: vec4): void {
    if (this.coreMaterial) {
      this.coreMaterial.mainPass.baseColor = new vec4(color.x, color.y, color.z, 1)
    }
    for (const shell of this.shells) {
      const existing = shell.mainPass.baseColor
      shell.mainPass.baseColor = new vec4(color.x, color.y, color.z, existing.w)
    }
  }

  private tick(): void {
    if (!this.built) {
      return
    }
    this.advanceTravel()
    this.breathe()
    this.settleColor()
    this.swirl()
    this.apply()
  }

  /** Bob and swell, so the orb reads as alive even while it is holding. */
  private breathe(): void {
    if (!this.root) {
      return
    }
    const time = getTime()
    // Half a cycle below full size and half above would make the orb bigger
    // than authored, so the swell runs from pulseMin up to 1 and no further.
    const wave = (Math.sin(time * this.pulseSpeed * Math.PI * 2) + 1) * 0.5
    const scale = this.pulseMin + (1 - this.pulseMin) * wave
    this.root.getTransform().setLocalScale(vec3.one().uniformScale(scale))
  }

  /** Let a graded colour lapse back to neutral once it has been seen. */
  private settleColor(): void {
    if (this.accuracyUntil < 0 || getTime() < this.accuracyUntil) {
      return
    }
    this.accuracyUntil = -1
    this.paint(this.idleColor)
  }

  private advanceTravel(): void {
    if (this.travelStart < 0) {
      return
    }
    const elapsed = getTime() - this.travelStart
    const t = Math.min(1, elapsed / this.travelDuration)
    // Burst out, run past the mark, settle back onto it. A plain glide arrives
    // without ever looking like it stopped; the overshoot is what makes the
    // hold on the next count read as a hold.
    const back = 1.70158 * this.overshoot
    const eased = 1 + (back + 1) * Math.pow(t - 1, 3) + back * Math.pow(t - 1, 2)
    this.offset = this.travelFrom + (this.travelTo - this.travelFrom) * eased

    if (t >= 1) {
      this.offset = this.travelTo
      this.travelStart = -1
    }
  }

  private apply(): void {
    if (!this.root) {
      return
    }
    const travel = this.offset * this.stepDistance
    // Lateral rides local X, which the placement yaw put on the dancer's right.
    // Sagittal rides local -Z, so a positive step carries the orb away from
    // them — the direction the routine calls "forward".
    const hover = Math.sin(getTime() * this.hoverSpeed * Math.PI * 2) * this.hoverAmplitude
    const position =
      this.axis === Axis.Lateral ? new vec3(travel, hover, 0) : new vec3(0, hover, -travel)
    this.root.getTransform().setLocalPosition(position)
  }

  private swirl(): void {
    const time = getTime()
    const radius = this.coreRadius * this.swirlRadius

    for (const particle of this.particles) {
      const angle = particle.phase + time * this.swirlSpeed * particle.drift * Math.PI * 2
      // A tilted circle per particle: the ring is drawn in X/Z then lifted by
      // the particle's own tilt, which spreads the cloud over the sphere.
      const flat = Math.cos(particle.tilt)
      particle.object
        .getTransform()
        .setLocalPosition(
          new vec3(Math.cos(angle) * radius * flat, Math.sin(particle.tilt) * radius, Math.sin(angle) * radius * flat)
        )
    }
  }
}
