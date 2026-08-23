import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {StateName} from "SpectaclesUIKit.lspkg/Scripts/Components/Element"
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {DANCES, DanceProgress, danceLabel} from "./DanceCatalog"
import {DanceDetailView} from "./DanceDetailView"
import {PanelRendering} from "./PanelRendering"
import {PanelStack} from "./PanelStack"
import {UISoundService} from "./UISoundService"

/** One built row: the pieces that have to be repainted or moved after it exists. */
type Row = {
  object: SceneObject
  button: Button
  label: Text
  check: SceneObject | null
  /** Where the row sits down the list, cm, before scrolling. Fixed once built. */
  y: number
}

/**
 * A scrolling list of every dance, used by both Latin Dances and Tracker.
 *
 * Rows are cloned at run time from one authored template rather than placed one
 * by one — a dozen rows hand-placed in the scene would have to be renumbered by
 * hand every time the catalogue changes, and there are two lists that must stay
 * in step.
 *
 * The scrolling is done here rather than with a UIKit ScrollWindow. That
 * component moves its own position into a ScreenTransform and then lets the
 * enclosing Frame lay it out, so an authored position does not survive; and its
 * masking only clips inside a ScreenTransform hierarchy, which these panels —
 * world-space plates floating in the room — are not. Moving a plain container
 * and hiding whatever falls outside gives the same result and stays put.
 */
@component
export class DanceListView extends BaseScriptComponent {
  @input
  @hint(
    "Plain container the rows are cloned into. Its origin is the TOP of the \
visible list area; rows run downward from there."
  )
  private rowParent: SceneObject

  @input
  @allowUndefined
  @hint("Scrollbar driving the list. Rotated 90 on Z so it reads as vertical.")
  private slider: Slider

  @input
  @hint(
    "A single authored row — a UIKit Button with a Text label — used as the \
template every row is cloned from. Keep it switched off; it is never shown."
  )
  private rowTemplate: SceneObject

  @ui.group_start("Layout")
  @input
  @hint("Row width, cm.")
  private rowWidth: number = 24

  @input
  @hint("Row height, cm.")
  private rowHeight: number = 3.2

  @input
  @hint("Gap between rows, cm.")
  private rowGap: number = 0.6

  @input
  @hint("Height of the visible list area, cm. Rows outside it are hidden.")
  private viewportHeight: number = 15

  @input
  private labelSize: number = 30

  @ui.group_end

  @input
  @hint(
    "Turn on for the Tracker list: rows show a completion tick and stop being \
pressable, since there is nothing behind them to open."
  )
  private progressMode: boolean = false

  @ui.group_start("Completion")
  @input
  @hint("Glyph shown at the right of a finished row.")
  private checkGlyph: string = "✓"
  @ui.group_end

  @input
  @hint(
    "Render order for the rows. Must sit above whatever the panel's own \
PanelRendering gave the list area, or rows draw behind the frame."
  )
  private rowRenderOrder: number = 6

  @input
  @allowUndefined
  @hint("Detail page opened when a row is pressed. Ignored in Tracker mode.")
  private detailPanel: SceneObject

  @input
  @allowUndefined
  @hint("The detail page's view, populated with the chosen dance.")
  private detailView: DanceDetailView

  @input
  @hint("Dev only: open this row's detail page on its own, so the page can be checked without a pinch. -1 disables.")
  private autoOpenIndex: number = -1

  private built: boolean = false
  private rows: Row[] = []
  private selected: number = -1
  private maxScroll: number = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.open())
    // Also builds on enable: the panel starts switched off, so OnStart never
    // fires for it. Repainting on every show is what keeps Tracker current
    // with tutorials finished since it was last opened.
    this.createEvent("OnEnableEvent").bind(() => this.open())
  }

  private open(): void {
    this.build()
    this.applyLabels()
  }

  private build(): void {
    if (this.built || !this.rowTemplate || !this.rowParent) {
      return
    }
    this.built = true

    const step = this.rowHeight + this.rowGap
    for (let i = 0; i < DANCES.length; i++) {
      const dance = DANCES[i]
      // Cloned from an authored row rather than built component by component:
      // the row is a UIKit Button, and its theme, shape and label styling are
      // far easier to get right by eye in the Inspector than in code.
      const row = this.rowParent.copyWholeHierarchy(this.rowTemplate)
      row.enabled = true
      row.name = "Row_" + dance.name + "_" + dance.region

      // Measured from the top of the list area downward, so the first dance
      // sits at the top rather than the list being centred on the origin.
      const y = -i * step - this.rowHeight * 0.5
      row.getTransform().setLocalPosition(new vec3(0, y, 0))
      row.getTransform().setLocalRotation(quat.quatIdentity())

      const button = row.getComponent(Button.getTypeName()) as Button
      const label = this.findLabel(row)
      if (!button || !label) {
        continue
      }

      // Theme, shape and style are whatever the template was authored with —
      // deliberately not overridden here. Calling setVariant on a fresh clone
      // rebuilds its visual and leaves the row with no plate at all, and the
      // look is easier to get right by eye on the template anyway. Only the
      // size is set, because that is driven by the layout inputs.
      button.size = new vec3(this.rowWidth, this.rowHeight, 1)

      if (this.progressMode) {
        // A Tracker row is a readout, not a link. It also must not react to a
        // pointer at all: the finished rows are drawn in the theme's hover
        // look, so a row that lit up under the cursor would claim to be
        // finished when it isn't. Marking it inactive is most of that, and the
        // Interactable is switched off outright so nothing can raise a hover
        // whatever order the control happens to initialise in.
        button.inactive = true
        const interactable = row.getComponent(Interactable.getTypeName()) as Interactable
        if (interactable) {
          interactable.enabled = false
        }
      } else {
        // A toggle button carries the theme's own toggled visuals, so the
        // selected row picks up the same treatment as every other selected
        // control in the lens instead of a tint invented here. Hover comes free
        // with it.
        button.setIsToggleable(true)
        UISoundService.attach(button)

        const index = i
        button.onTriggerUp.add(() => this.select(index))
      }

      label.size = this.labelSize
      // Rows are built after the panel's own PanelRendering pass has run, so
      // they have to be ordered and un-culled here or they flicker and drop out
      // of view exactly as the authored content used to.
      PanelRendering.apply(row, this.rowRenderOrder, 10)

      this.rows.push({object: row, button: button, label: label, check: this.makeCheck(row, label), y: y})
    }

    const content = DANCES.length * step - this.rowGap
    this.maxScroll = Math.max(0, content - this.viewportHeight)
    this.bindSlider()
    this.scrollTo(0)

    if (this.autoOpenIndex >= 0 && this.autoOpenIndex < this.rows.length) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.select(this.autoOpenIndex))
      timer.reset(0.5)
    }
  }

  /**
   * A tick sitting at the right-hand end of a finished row.
   *
   * Built as its own Text rather than pasted onto the front of the label, so
   * the dance names stay flush down the left edge whether or not they are
   * ticked — a prefixed marker shunts every completed name sideways.
   */
  private makeCheck(row: SceneObject, label: Text): SceneObject | null {
    if (!this.progressMode) {
      return null
    }
    const holder = global.scene.createSceneObject("Check")
    holder.setParent(row)
    holder.getTransform().setLocalPosition(new vec3(this.rowWidth * 0.5 - this.rowHeight * 0.6, 0, 0.1))
    holder.getTransform().setLocalRotation(quat.quatIdentity())

    const check = holder.createComponent("Component.Text") as Text
    check.size = this.labelSize
    if (label.font) {
      check.font = label.font
    }
    check.text = this.checkGlyph
    check.textFill.color = label.textFill.color
    // Built after this row's PanelRendering pass, so it needs its own order —
    // one level down from the row, and above that level's geometry.
    check.renderOrder = this.rowRenderOrder + 3
    return holder
  }

  private applyLabels(): void {
    for (let i = 0; i < this.rows.length && i < DANCES.length; i++) {
      const row = this.rows[i]
      row.label.text = danceLabel(i)

      // The whole holder is switched off rather than the text blanked, so an
      // unfinished row leaves no gap where a tick would sit.
      if (row.check) {
        row.check.enabled = this.isDone(i)
      }
    }
    this.paintStates()

    // Again once UIKit has built its visuals: a control initialises itself to
    // its default state, and on the first open that happens after this runs and
    // would wipe the highlight straight off the finished rows.
    const settle = this.createEvent("DelayedCallbackEvent")
    settle.bind(() => this.paintStates())
    settle.reset(0)
  }

  private isDone(index: number): boolean {
    return this.progressMode && DanceProgress.isComplete(DANCES[index].name)
  }

  /**
   * Show a finished dance in the theme's hover look.
   *
   * Borrowing the hover state rather than inventing a colour keeps the Tracker
   * inside the same visual language as every other control in the lens. It only
   * reads as "finished" because nothing in this list can actually be hovered —
   * the rows are inactive, so the highlight is never something the dancer's own
   * pointer could have caused.
   */
  private paintStates(): void {
    if (!this.progressMode) {
      return
    }
    for (let i = 0; i < this.rows.length; i++) {
      const visual = this.rows[i].button.visual
      if (visual) {
        visual.setState(this.isDone(i) ? StateName.hovered : StateName.default)
      }
    }
  }

  /**
   * Move the list to a scroll offset in centimetres, then hide what fell out.
   *
   * Rows are dropped as soon as any part of them would leave the visible area
   * rather than when their centre does, so the list ends cleanly at the edge
   * instead of with a row sliced in half by the frame.
   */
  private scrollTo(offset: number): void {
    const clamped = Math.max(0, Math.min(this.maxScroll, offset))
    this.rowParent.getTransform().setLocalPosition(new vec3(0, clamped, 0))

    for (const row of this.rows) {
      const centre = row.y + clamped
      // A hair of tolerance, so a row sitting exactly on the boundary is kept
      // rather than flickering out on a rounding error.
      const top = centre + this.rowHeight * 0.5
      const bottom = centre - this.rowHeight * 0.5
      row.object.enabled = top <= 0.01 && bottom >= -this.viewportHeight - 0.01
    }
  }

  /** Knob at the top shows the top of the list, which is where it opens. */
  private bindSlider(): void {
    if (!this.slider) {
      return
    }
    this.slider.currentValue = 1
    this.slider.onKnobMoved.add((value: number) => this.scrollTo((1 - value) * this.maxScroll))
  }

  /**
   * Mark a row as the chosen one and open its page.
   *
   * The previous row is switched off explicitly: the theme's toggled state is
   * per-button, so without this the list would slowly fill up with rows that
   * all look selected.
   */
  private select(index: number): void {
    if (this.selected >= 0 && this.selected !== index && this.selected < this.rows.length) {
      this.rows[this.selected].button.toggle(false)
    }
    this.selected = index
    if (index >= 0 && index < this.rows.length) {
      this.rows[index].button.toggle(true)
    }
    this.openDetail(index)
  }

  private openDetail(index: number): void {
    if (!this.detailPanel) {
      return
    }
    if (this.detailView) {
      this.detailView.show(DANCES[index])
    }
    const stack = PanelStack.get()
    if (stack) {
      stack.open(this.detailPanel)
    }
  }

  private findLabel(root: SceneObject): Text | null {
    const own = root.getComponent("Component.Text")
    if (own) {
      return own as Text
    }
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findLabel(root.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }
}
