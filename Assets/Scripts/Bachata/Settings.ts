import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

/**
 * Lens-wide preferences, held outside the scene graph.
 *
 * The Settings panel is a child of the globe screen, but the trainer that has
 * to obey Mirror Mode lives in a different branch and is switched off while the
 * menu is open — so the two can never hold a direct reference to each other.
 * A static holder lets the setting outlive whichever panel set it.
 */
export class Settings {
  private static _mirrorMode: boolean = false

  private static readonly changedEvent: Event<boolean> = new Event<boolean>()
  /** Fires whenever Mirror Mode is switched, with the new state. */
  public static readonly onMirrorModeChanged: PublicApi<boolean> = Settings.changedEvent.publicApi()

  /**
   * Off means the dancer's travel is read from head world position; on means it
   * is read from a body tracker watching their reflection.
   */
  public static get mirrorMode(): boolean {
    return Settings._mirrorMode
  }

  public static set mirrorMode(on: boolean) {
    if (Settings._mirrorMode === on) {
      return
    }
    Settings._mirrorMode = on
    Settings.changedEvent.invoke(on)
  }
}
