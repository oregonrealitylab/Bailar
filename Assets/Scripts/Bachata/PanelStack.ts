import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

/**
 * Navigation for the stacked menu panels.
 *
 * Only ever one panel is on screen. Opening pushes, BACK pops to whatever was
 * underneath, and X drops the whole stack at once. Keeping the history here
 * rather than wiring panel-to-panel means a panel doesn't need to know who
 * opened it — the same dance detail page can be reached from more than one
 * place and BACK still returns to the right caller.
 */
@component
export class PanelStack extends BaseScriptComponent {
  private static instance: PanelStack | null = null

  @input
  @allowUndefined
  @hint("Every panel this stack manages. All are switched off at start.")
  private panels: SceneObject[]

  private history: SceneObject[] = []

  private onEmptiedEvent: Event<void> = new Event<void>()
  /** Fires when the last panel closes, so the caller can restore its own UI. */
  public readonly onEmptied: PublicApi<void> = this.onEmptiedEvent.publicApi()

  public static get(): PanelStack | null {
    return PanelStack.instance
  }

  private cleared: boolean = false

  onAwake(): void {
    PanelStack.instance = this
    // The globe screen this lives under can be switched on partway through the
    // opening sequence, and OnStart never fires for an object that started
    // disabled — so clear the panels from whichever event arrives first.
    this.createEvent("OnStartEvent").bind(() => this.clearOnce())
    this.createEvent("OnEnableEvent").bind(() => this.clearOnce())
  }

  private clearOnce(): void {
    if (this.cleared) {
      return
    }
    this.cleared = true
    this.hideAll()
  }

  public get isOpen(): boolean {
    return this.history.length > 0
  }

  /** Push a panel on top of whatever is showing. */
  public open(panel: SceneObject): void {
    if (!panel) {
      return
    }
    const current = this.top()
    if (current) {
      current.enabled = false
    }
    this.history.push(panel)
    panel.enabled = true
  }

  /** Pop back one level. Closing the last panel empties the stack. */
  public back(): void {
    if (this.history.length === 0) {
      return
    }
    const leaving = this.history.pop()
    if (leaving) {
      leaving.enabled = false
    }

    const revealed = this.top()
    if (revealed) {
      revealed.enabled = true
      return
    }
    this.onEmptiedEvent.invoke()
  }

  /** Drop everything and hand control back to whatever was underneath. */
  public closeAll(): void {
    if (this.history.length === 0) {
      return
    }
    this.history = []
    this.hideAll()
    this.onEmptiedEvent.invoke()
  }

  private top(): SceneObject | null {
    if (this.history.length === 0) {
      return null
    }
    return this.history[this.history.length - 1]
  }

  private hideAll(): void {
    if (!this.panels) {
      return
    }
    for (const panel of this.panels) {
      if (panel) {
        panel.enabled = false
      }
    }
  }
}
