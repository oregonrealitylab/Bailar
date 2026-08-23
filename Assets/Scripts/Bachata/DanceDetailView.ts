import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {DANCES, DanceEntry} from "./DanceCatalog"

/**
 * The page for one dance: its name, where it is from, a picture, and the
 * write-up.
 *
 * One page serves every dance rather than twelve near-identical panels — the
 * list hands it an entry and it repaints.
 *
 * The write-up is wrapped and scrolled here rather than handed to a Text
 * component to lay out. A world-space Text has no extents to wrap against, so
 * it would run the whole article off the side of the panel as one line; and the
 * article is several times taller than the panel, with nothing to clip it
 * because these panels are not a masked canvas. Wrapping to a line list and
 * drawing only the lines that fit solves both at once, and the scrollbar
 * behaves like the one on the dance list.
 */
@component
export class DanceDetailView extends BaseScriptComponent {
  @input
  private titleText: Text

  @input
  @allowUndefined
  @hint("Line under the title, showing where the dance is from.")
  private regionText: Text

  @input
  @allowUndefined
  @hint("Picture between the title and the write-up.")
  private image: Image

  @input
  @allowUndefined
  @hint(
    "One texture per dance, in catalogue order. Leave a slot empty — or the \
whole list — and that dance falls back to the placeholder."
  )
  private danceImages: Texture[]

  @input
  @allowUndefined
  @hint("Shown wherever a dance has no picture of its own yet.")
  private placeholderImage: Texture

  @input
  @allowUndefined
  @hint("The write-up. Only the lines that fit are drawn at any one time.")
  private bodyText: Text

  @input
  @allowUndefined
  @hint("Scrollbar for the write-up. Rotated 90 on Z so it reads as vertical.")
  private slider: Slider

  @ui.group_start("Body layout")
  @input
  @hint(
    "Characters per line to wrap at. Lower this if the text runs past the edge \
of the panel; raise it if the lines look short."
  )
  private charsPerLine: number = 46

  @input
  @hint("How many lines are on screen at once.")
  private visibleLines: number = 9
  @ui.group_end

  private lines: string[] = []
  private offset: number = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.bindSlider())
    this.createEvent("OnEnableEvent").bind(() => this.bindSlider())
  }

  private bound: boolean = false

  private bindSlider(): void {
    if (this.bound || !this.slider) {
      return
    }
    this.bound = true
    this.slider.onKnobMoved.add((value: number) => {
      this.offset = Math.round((1 - value) * this.maxOffset())
      this.draw()
    })
  }

  /** Repaint the page for a given dance. */
  public show(dance: DanceEntry): void {
    if (!dance) {
      return
    }
    if (this.titleText) {
      this.titleText.text = dance.title
    }
    if (this.regionText) {
      this.regionText.text = dance.region
    }
    this.paintImage(dance)

    this.lines = this.layOut(dance)
    // Every dance opens at the top of its own write-up, not wherever the last
    // one was left scrolled to.
    this.offset = 0
    if (this.slider) {
      this.slider.currentValue = 1
    }
    this.draw()
  }

  /**
   * Turn the three sections into a single list of wrapped lines.
   *
   * The headings are what make the article scannable once it is only nine lines
   * at a time — without them a reader who has scrolled has no idea whether they
   * are reading about history or about tempo.
   */
  private layOut(dance: DanceEntry): string[] {
    const out: string[] = []
    const sections: {heading: string; body: string}[] = [
      {heading: "ORIGIN", body: dance.origin},
      {heading: "MOVEMENT", body: dance.movement},
      {heading: "TEMPO", body: dance.tempo}
    ]

    for (const section of sections) {
      if (out.length > 0) {
        out.push("")
      }
      out.push(section.heading)
      for (const line of this.wrap(section.body)) {
        out.push(line)
      }
    }
    return out
  }

  /** Greedy word wrap. A word longer than a line is left to overhang. */
  private wrap(text: string): string[] {
    const lines: string[] = []
    let current = ""

    for (const word of text.split(" ")) {
      if (current.length === 0) {
        current = word
      } else if (current.length + 1 + word.length <= this.charsPerLine) {
        current = current + " " + word
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current.length > 0) {
      lines.push(current)
    }
    return lines
  }

  private maxOffset(): number {
    return Math.max(0, this.lines.length - this.visibleLines)
  }

  private draw(): void {
    if (!this.bodyText) {
      return
    }
    const start = Math.max(0, Math.min(this.maxOffset(), this.offset))
    this.bodyText.text = this.lines.slice(start, start + this.visibleLines).join("\n")
  }

  /**
   * Looked up by the dance's index in the catalogue rather than by name, so
   * the Inspector list stays a plain parallel array the author can fill in one
   * slot at a time.
   */
  private paintImage(dance: DanceEntry): void {
    if (!this.image) {
      return
    }
    const index = DANCES.indexOf(dance)
    const own = this.danceImages && index >= 0 && index < this.danceImages.length ? this.danceImages[index] : null
    const texture = own ?? this.placeholderImage
    if (texture) {
      this.image.mainPass.baseTex = texture
    }
    // A page with neither a real picture nor a placeholder shows an empty
    // frame rather than whichever dance was opened before this one.
    this.image.enabled = !!texture
  }
}
