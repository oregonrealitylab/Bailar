/**
 * All the on-screen feedback for a session: the count, the instruction, the
 * per-step verdict, the flash light, and the live tracking readout.
 *
 * Kept separate from the trainer so the grading logic never touches a Text
 * component directly.
 */

export const VERDICT_GREEN: vec4 = new vec4(0.24, 0.95, 0.45, 1)
export const VERDICT_AMBER: vec4 = new vec4(1.0, 0.74, 0.2, 1)
export const VERDICT_RED: vec4 = new vec4(1.0, 0.35, 0.35, 1)
export const VERDICT_NEUTRAL: vec4 = new vec4(0.85, 0.88, 0.92, 1)

@component
export class CoachDisplay extends BaseScriptComponent {
  @input
  @hint("Large 1-8 count readout.")
  private countText: Text

  @input
  @hint("What to do right now.")
  private promptText: Text

  @input
  @allowUndefined
  @hint("Current stage and set progress, e.g. 'Side to side - Set 1/2'.")
  private stageText: Text

  @input
  @hint("Verdict on the step just taken.")
  private verdictText: Text

  @input
  @allowUndefined
  @hint("Live lateral/velocity readout. Turn off once tracking is trusted.")
  private debugText: Text

  @input
  @allowUndefined
  @hint("Additive plane behind the panel. Flashes on each graded step.")
  private feedbackLight: RenderMeshVisual

  @input
  @allowUndefined
  @hint("The panel the light sits behind. The light is sized from it automatically.")
  private panelObject: SceneObject

  @input
  @hint("How far the glow extends past every edge of the panel, cm.")
  private lightMargin: number = 7

  @input
  @hint("Seconds for the flash to decay back to black.")
  @widget(new SliderWidget(0.1, 1.5, 0.05))
  private flashDecay: number = 0.4

  @input
  private showDebug: boolean = true

  private lightMaterial: Material | null = null
  private flashColor: vec4 = VERDICT_GREEN
  private flashLevel: number = 0
  private pulseLevel: number = 0

  onAwake(): void {
    // Clone so the flash never writes back into the shared material asset.
    if (this.feedbackLight) {
      this.lightMaterial = this.feedbackLight.mainMaterial.clone()
      this.feedbackLight.mainMaterial = this.lightMaterial
    }
    if (this.debugText) {
      this.debugText.enabled = this.showDebug
    }

    this.applyLight(0)
    // Deferred to OnStart: the Frame builds its body object during its own
    // init, so it does not exist yet while this component is awaking.
    this.createEvent("OnStartEvent").bind(() => this.fitLightToPanel())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onUpdate(): void {
    const dt = getDeltaTime()

    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt / this.flashDecay)
      this.applyLight(this.flashLevel)
    }

    if (this.pulseLevel > 0) {
      this.pulseLevel = Math.max(0, this.pulseLevel - dt / 0.25)
      this.applyPulse()
    }
  }

  /**
   * Match the glow to the panel it sits behind, plus an even margin.
   *
   * Measured from the panel body's own bounds rather than from the Frame's
   * innerSize, because the rendered body is a fraction of that value — sizing
   * off innerSize leaves the glow the wrong shape. Doing it here means the
   * halo stays even on all four edges whenever the panel is resized, instead
   * of needing the plane's scale hand-edited to match.
   */
  private fitLightToPanel(): void {
    if (!this.feedbackLight || !this.panelObject) {
      return
    }
    const body = this.findPanelBody(this.panelObject)
    if (!body) {
      return
    }
    // World bounds, not local: the frame body carries its own scale, so its
    // local AABB is the unscaled mesh and reads about twice the real size.
    // Everything from the panel down sits at scale 1, so world centimetres and
    // the light's local scale units are the same thing.
    const min = body.worldAabbMin()
    const max = body.worldAabbMax()
    const width = Math.abs(max.x - min.x) + this.lightMargin * 2
    const height = Math.abs(max.y - min.y) + this.lightMargin * 2

    // The plane mesh lies in XZ and is stood upright by a 90° X rotation, so
    // its local Z carries the on-screen height.
    this.feedbackLight.getSceneObject().getTransform().setLocalScale(new vec3(width, 1, height))
  }

  /**
   * The Frame names its backing quad "FramePanelObject" and creates it at
   * runtime, so it can't be wired in the Inspector — it has to be found.
   */
  private findPanelBody(root: SceneObject): RenderMeshVisual | null {
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const child = root.getChild(i)
      if (child.name === "FramePanelObject") {
        const visual = child.getComponent("Component.RenderMeshVisual")
        if (visual) {
          return visual as RenderMeshVisual
        }
      }
      const found = this.findPanelBody(child)
      if (found) {
        return found
      }
    }
    return null
  }

  public setCount(value: string): void {
    if (this.countText) {
      this.countText.text = value
    }
  }

  public setPrompt(value: string): void {
    if (this.promptText) {
      this.promptText.text = value
    }
  }

  public setStage(value: string): void {
    if (this.stageText) {
      this.stageText.text = value
    }
  }

  public setVerdict(value: string, color: vec4): void {
    if (this.verdictText) {
      this.verdictText.text = value
      this.verdictText.textFill.color = color
    }
  }

  public setDebug(value: string): void {
    if (this.debugText && this.showDebug) {
      this.debugText.text = value
    }
  }

  /** Punch the light to full in `color`; it decays on its own from there. */
  public flash(color: vec4): void {
    this.flashColor = color
    this.flashLevel = 1
    this.applyLight(1)
  }

  /**
   * Metronome pulse, so the beat reads even when no step has been graded.
   *
   * This drives the count digit's brightness rather than the flash light on
   * purpose: sharing one channel let a once-per-beat neutral pulse overwrite
   * the verdict colour mid-decay, so a green step washed out to grey before
   * the dancer could see it.
   */
  public pulse(strength: number): void {
    if (strength > this.pulseLevel) {
      this.pulseLevel = strength
      this.applyPulse()
    }
  }

  private applyPulse(): void {
    if (!this.countText) {
      return
    }
    const level = 0.4 + 0.6 * this.pulseLevel
    this.countText.textFill.color = new vec4(level, level, level, 1)
  }

  private applyLight(level: number): void {
    if (!this.lightMaterial) {
      return
    }
    // Additive blend: brightness is carried by RGB, so scale the colour rather
    // than the alpha channel.
    this.lightMaterial.mainPass.baseColor = new vec4(
      this.flashColor.x * level,
      this.flashColor.y * level,
      this.flashColor.z * level,
      1
    )
  }
}
