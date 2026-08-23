/**
 * A ring of 3D text orbiting above the globe.
 *
 * The message is repeated around a circle so that whichever way the viewer is
 * facing, a copy is coming into view — the prompt reads as part of the scene
 * rather than as a label pinned to the screen.
 *
 * The text is laid out one glyph at a time. A single Text3D would render flat
 * and cut a straight chord across a curved path; placing each character on its
 * own point of the circle, turned to face outward, is what makes the words wrap
 * around the planet.
 */
@component
export class OrbitingPrompt extends BaseScriptComponent {
  @input
  @hint("The words to orbit.")
  private message: string = "Pick a Region"

  @input
  @hint("How many copies to space evenly around the ring.")
  private copies: number = 2

  @input
  @hint("3D font for the text.")
  private font: Font

  @input
  @hint("Material cloned per character. Its base colour is overwritten per glyph.")
  private baseMaterial: Material

  @ui.group_start("Ring")
  @input
  @hint("Distance from the globe's centre out to the text, cm.")
  private radius: number = 26

  @input
  @hint("Height above the globe's centre, cm. Raise it to sit further over the top.")
  private height: number = 22

  @input
  @hint("Angle between one character and the next, degrees. Widen it to spread the words out.")
  private degreesPerCharacter: number = 5.5

  @input
  @hint("Tilt of the text, degrees. Negative tips the tops of the letters outward.")
  private pitch: number = -20
  @ui.group_end

  @ui.group_start("Type")
  @input
  private textSize: number = 3

  @input
  private extrusionDepth: number = 0.4
  @ui.group_end

  @input
  @hint("Orbit speed in degrees per second. Negative reverses it, 0 holds it still.")
  @widget(new SliderWidget(-60, 60, 1))
  private degreesPerSecond: number = 8

  @ui.group_start("Colour")
  @input
  @hint("Colour of the letters. White reads cleanly against the globe.")
  @widget(new ColorWidget())
  private faceColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @hint(
    "Sweep the UI's violet-to-teal gradient across the words instead of using \
the flat colour above. A Text3D carries one material for the whole extruded \
glyph, face and sides together, so this tints the letters rather than just \
their edges — handsome, but harder to read against the earth."
  )
  private useGradient: boolean = false

  @input
  @hint("One end of the sweep.")
  @widget(new ColorWidget())
  private colorStart: vec4 = new vec4(0.34, 0.22, 0.52, 1)

  @input
  @hint("Middle of the sweep.")
  @widget(new ColorWidget())
  private colorMiddle: vec4 = new vec4(0.26, 0.36, 0.5, 1)

  @input
  @hint("The far end of the sweep.")
  @widget(new ColorWidget())
  private colorEnd: vec4 = new vec4(0.2, 0.56, 0.52, 1)

  @input
  @hint(
    "Multiplies the gradient. The UI's own values are tuned for a lit panel and \
read dark on unlit text, so this lifts them without changing the hues."
  )
  @widget(new SliderWidget(0.5, 4, 0.1))
  private brightness: number = 2.2
  @ui.group_end

  private spin: number = 0
  private built: boolean = false

  onAwake(): void {
    // Built from whichever fires first: the globe screen this sits under can be
    // switched on partway through the opening, and OnStart never fires for an
    // object that started disabled.
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("OnEnableEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.orbit())
  }

  private build(): void {
    if (this.built || !this.font || !this.baseMaterial) {
      return
    }
    this.built = true

    const characters = this.message.split("")
    const spacing = this.degreesPerCharacter * MathUtils.DegToRad
    const step = (Math.PI * 2) / Math.max(1, this.copies)

    for (let copy = 0; copy < this.copies; copy++) {
      // Centre each copy on its own share of the circle, so the words sit
      // symmetrically about that point rather than trailing away from it.
      const centre = copy * step
      const start = centre - (spacing * (characters.length - 1)) * 0.5

      for (let i = 0; i < characters.length; i++) {
        const glyph = characters[i]
        if (glyph === " ") {
          // Spaces still take up their share of the arc, but there is nothing
          // to draw and an empty Text3D would just cost a component.
          continue
        }
        this.placeGlyph(glyph, start + spacing * i, this.shade(i, characters.length))
      }
    }
  }

  private placeGlyph(glyph: string, angle: number, color: vec4): void {
    const object = global.scene.createSceneObject("Glyph_" + glyph)
    object.setParent(this.sceneObject)

    const transform = object.getTransform()
    transform.setLocalPosition(new vec3(Math.sin(angle) * this.radius, this.height, Math.cos(angle) * this.radius))
    // A Y-rotation by the same angle sends local +Z — the face of the text —
    // straight out from the centre, so every character faces the viewer as it
    // comes round. The pitch is applied after, in the character's own frame, so
    // the letters lean back consistently all the way round the ring.
    transform.setLocalRotation(
      quat.angleAxis(angle, vec3.up()).multiply(quat.angleAxis(this.pitch * MathUtils.DegToRad, vec3.right()))
    )

    const text = object.createComponent("Component.Text3D") as Text3D
    text.text = glyph
    text.font = this.font
    text.size = this.textSize
    text.extrusionDepth = this.extrusionDepth

    // Cloned per character: the gradient is carried by each glyph's own base
    // colour, so a shared material would flatten the whole ring to one hue.
    const material = this.baseMaterial.clone()
    material.mainPass.baseColor = color
    text.mainMaterial = material
  }

  /** Colour for the character at `index`, swept across the three stops. */
  private shade(index: number, count: number): vec4 {
    if (!this.useGradient) {
      return this.faceColor
    }
    const t = count <= 1 ? 0 : index / (count - 1)
    const from = t < 0.5 ? this.colorStart : this.colorMiddle
    const to = t < 0.5 ? this.colorMiddle : this.colorEnd
    const local = t < 0.5 ? t * 2 : (t - 0.5) * 2

    return new vec4(
      this.mix(from.x, to.x, local) * this.brightness,
      this.mix(from.y, to.y, local) * this.brightness,
      this.mix(from.z, to.z, local) * this.brightness,
      this.mix(from.w, to.w, local)
    )
  }

  private mix(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  private orbit(): void {
    if (!this.built) {
      return
    }
    this.spin += this.degreesPerSecond * MathUtils.DegToRad * getDeltaTime()
    this.getTransform().setLocalRotation(quat.angleAxis(this.spin, vec3.up()))
  }
}
