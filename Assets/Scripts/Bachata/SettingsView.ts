import {Switch} from "SpectaclesUIKit.lspkg/Scripts/Components/Switch/Switch"
import {Settings} from "./Settings"
import {UISoundService} from "./UISoundService"

/**
 * The Settings page. One option so far: Mirror Mode.
 *
 * The switch reports into {@link Settings} rather than reaching for the
 * trainer, because the trainer is switched off while this panel is open and
 * only reads the preference when a lesson starts.
 */
@component
export class SettingsView extends BaseScriptComponent {
  @input
  @hint("Switch controlling Mirror Mode. Defaults to off.")
  private mirrorSwitch: Switch

  @input
  @allowUndefined
  @hint("Line under the switch explaining what the current state does.")
  private mirrorStatusText: Text

  private static readonly OFF_COPY =
    "Off — your steps are read from how far you\ntravel around the room."

  private static readonly ON_COPY =
    "On — stand facing a mirror. Your steps are\nread from your reflection instead."

  private wired: boolean = false

  onAwake(): void {
    // Same as every other panel script: this page starts switched off, so
    // OnStart alone would never run.
    this.createEvent("OnStartEvent").bind(() => this.wire())
    this.createEvent("OnEnableEvent").bind(() => this.wire())
  }

  private wire(): void {
    if (this.wired) {
      return
    }
    this.wired = true

    if (!this.mirrorSwitch) {
      return
    }
    UISoundService.attach(this.mirrorSwitch)

    // Show whatever the setting already is: the panel can be reopened, and a
    // switch that always drew itself off would lie about the second visit.
    this.mirrorSwitch.toggle(Settings.mirrorMode)
    this.describe(Settings.mirrorMode)

    this.mirrorSwitch.onFinished.add(() => {
      const on = this.mirrorSwitch.isOn
      Settings.mirrorMode = on
      this.describe(on)
    })
  }

  private describe(on: boolean): void {
    if (this.mirrorStatusText) {
      this.mirrorStatusText.text = on ? SettingsView.ON_COPY : SettingsView.OFF_COPY
    }
  }
}
