import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"

/**
 * The How To Use page: a title and a scrolling list of instructions.
 *
 * The copy lives here rather than in the Inspector because it is written as
 * sections of bullets and wrapped at run time, the same way the dance page
 * wraps its write-up — a world-space Text has nothing to wrap or clip against,
 * so it would run straight off the panel. Only the lines that fit are drawn,
 * and the scrollbar pages through the rest.
 */
@component
export class InfoView extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("The instructions. Only the lines that fit are drawn at any one time.")
  private bodyText: Text

  @input
  @allowUndefined
  @hint("Scrollbar for the instructions. Rotated 90 on Z so it reads as vertical.")
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

  private static readonly SECTIONS: {heading: string; bullets: string[]}[] = [
    {
      heading: "WHAT BAILAR IS FOR",
      bullets: [
        "Learn the basic steps of Latin dances at home, so your first class feels familiar instead of overwhelming.",
        "It is a warm-up for real lessons, not a replacement. Leading, following, partner work and styling are best learned from a teacher, in person."
      ]
    },
    {
      heading: "GETTING SET UP",
      bullets: [
        "Clear about 3 m x 3 m of floor.",
        "Look at the floor in front of you, then press Set Floor to place your dance space.",
        "Pick a region on the globe, then pick a dance to read about where it comes from."
      ]
    },
    {
      heading: "TAKING A LESSON",
      bullets: [
        "Stand with your feet together and hold still while the lens calibrates.",
        "Watch the orb first. It dances each step before you do. Press Watch Again to see it once more.",
        "Press Start. The coach counts you in, then follow the orb on the beat.",
        "Land each step cleanly. Settling on the count matters more than speed.",
        "The orb's colour shows how your last step went. Clean 8-counts clear each set.",
        "Press X at any time to restart the dance or go back to the main menu."
      ]
    },
    {
      heading: "MIRROR MODE",
      bullets: [
        "Practising in front of a mirror? Turn on Mirror Mode in Settings so your steps are read from your reflection."
      ]
    },
    {
      heading: "AFTER BAILAR",
      bullets: [
        "Once the basics feel natural, take them to a beginner class or a social dance. That is where the real dancing starts."
      ]
    }
  ]

  private lines: string[] = []
  private offset: number = 0
  private bound: boolean = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.paint())
    // Also on enable: the page starts switched off, so OnStart never fires for
    // it. Rewinding every time means it reopens at the top rather than
    // wherever it was last left scrolled to.
    this.createEvent("OnEnableEvent").bind(() => this.paint())
  }

  private paint(): void {
    if (!this.bound) {
      this.bound = true
      this.lines = this.layOut()
      if (this.slider) {
        this.slider.onKnobMoved.add((value: number) => {
          this.offset = Math.round((1 - value) * this.maxOffset())
          this.draw()
        })
      }
    }
    this.offset = 0
    if (this.slider) {
      this.slider.currentValue = 1
    }
    this.draw()
  }

  /** Headings, then each bullet wrapped with a hanging indent under its dot. */
  private layOut(): string[] {
    const out: string[] = []
    for (const section of InfoView.SECTIONS) {
      if (out.length > 0) {
        out.push("")
      }
      out.push(section.heading)
      for (const bullet of section.bullets) {
        this.wrap(bullet, this.charsPerLine - 2).forEach((line, i) => {
          out.push((i === 0 ? "• " : "   ") + line)
        })
      }
    }
    return out
  }

  /** Greedy word wrap. A word longer than a line is left to overhang. */
  private wrap(text: string, width: number): string[] {
    const lines: string[] = []
    let current = ""

    for (const word of text.split(" ")) {
      if (current.length === 0) {
        current = word
      } else if (current.length + 1 + word.length <= width) {
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
}
