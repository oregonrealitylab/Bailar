import {Element} from "SpectaclesUIKit.lspkg/Scripts/Components/Element"

/**
 * The lens's UI sounds, in one place.
 *
 * Exposed as a singleton because every screen needs the same three cues and
 * threading an audio reference through each controller would mean wiring the
 * same three clips into a dozen inspector slots.
 */
@component
export class UISoundService extends BaseScriptComponent {
  private static instance: UISoundService | null = null

  @input
  @allowUndefined
  @hint("Played when a pointer first lands on a button.")
  private hoverAudio: AudioComponent

  @input
  @allowUndefined
  @hint("Played the moment a button is pressed.")
  private selectAudio: AudioComponent

  @input
  @allowUndefined
  @hint("Played once at the start of a screen transition. Its length sets the transition budget.")
  private loadingAudio: AudioComponent

  @input
  @hint("Fallback transition length if the loading clip's duration can't be read, seconds.")
  private fallbackTransition: number = 2.0

  onAwake(): void {
    UISoundService.instance = this
  }

  public static get(): UISoundService | null {
    return UISoundService.instance
  }

  /**
   * Wire the standard hover and select cues onto a control.
   *
   * Every controller that owns buttons calls this rather than each one
   * re-deciding what a press should sound like. Typed against Element rather
   * than Button so switches and sliders get the same cues — the two events it
   * needs are declared there, not on Button.
   */
  public static attach(button: Element): void {
    if (!button) {
      return
    }
    button.onHoverEnter.add(() => {
      const service = UISoundService.instance
      if (service) {
        service.playHover()
      }
    })
    button.onTriggerUp.add(() => {
      const service = UISoundService.instance
      if (service) {
        service.playSelect()
      }
    })
  }

  /** Convenience for wiring a whole screen's worth of buttons at once. */
  public static attachAll(buttons: Element[]): void {
    if (!buttons) {
      return
    }
    for (const button of buttons) {
      UISoundService.attach(button)
    }
  }

  public playHover(): void {
    this.playOnce(this.hoverAudio)
  }

  public playSelect(): void {
    this.playOnce(this.selectAudio)
  }

  /** Starts the transition cue and returns how long the transition should last. */
  public playLoading(): number {
    this.playOnce(this.loadingAudio)
    return this.transitionDuration
  }

  /**
   * The transition is timed to the loading clip so the two finish together —
   * a fade that outlasts the sound reads as a stall, and one that ends early
   * leaves the audio playing over a settled screen.
   */
  public get transitionDuration(): number {
    if (this.loadingAudio && this.loadingAudio.duration > 0) {
      return this.loadingAudio.duration
    }
    return this.fallbackTransition
  }

  private playOnce(audio: AudioComponent): void {
    if (!audio) {
      return
    }
    audio.stop(false)
    audio.play(1)
  }
}
