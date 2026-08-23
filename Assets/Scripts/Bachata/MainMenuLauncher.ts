import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {GlobeController} from "./GlobeController"
import {PanelStack} from "./PanelStack"
import {UISoundService} from "./UISoundService"

/**
 * The Main Menu button sitting at the foot of the globe.
 *
 * Pressing it clears the orbs and hands the screen to the panel stack; when
 * the last panel closes the orbs come back. The globe itself keeps spinning
 * underneath throughout, so this is an overlay rather than a scene change.
 */
@component
export class MainMenuLauncher extends BaseScriptComponent {
  @input
  @hint("Button at the base of the globe.")
  private launchButton: Button

  @input
  @hint("Parent holding every menu panel. Positioned in front of the globe.")
  private menuRoot: SceneObject

  @input
  @hint("First panel to open.")
  private mainMenuPanel: SceneObject

  @input
  private globe: GlobeController

  @input
  @hint("Dev only: open the menu on its own after N seconds. 0 disables.")
  private autoOpenAfter: number = 0

  private stack: PanelStack | null = null

  private wired: boolean = false

  onAwake(): void {
    // Same reason as PanelStack: the globe screen can be enabled after the
    // opening sequence, so OnStart alone is not guaranteed to run.
    this.createEvent("OnStartEvent").bind(() => this.wire())
    this.createEvent("OnEnableEvent").bind(() => this.wire())
  }

  private wire(): void {
    if (this.wired) {
      return
    }
    this.wired = true

    if (this.menuRoot) {
      this.menuRoot.enabled = false
    }

    this.stack = PanelStack.get()
    if (this.stack) {
      this.stack.onEmptied.add(() => this.onClosed())
    }

    if (this.launchButton) {
      UISoundService.attach(this.launchButton)
      this.launchButton.onTriggerUp.add(() => this.open())
    }

    // A region's panel floats between the viewer and the globe, directly over
    // the spot this button sits on. Leaving it there would put a live control
    // underneath the panel the dancer is reading, so it goes away with the orbs
    // and comes back with them.
    if (this.globe) {
      this.globe.onRegionPanelOpened.add(() => this.showLaunchButton(false))
      this.globe.onRegionPanelClosed.add(() => this.showLaunchButton(true))
    }

    if (this.autoOpenAfter > 0) {
      const timer = this.createEvent("DelayedCallbackEvent")
      timer.bind(() => this.open())
      timer.reset(this.autoOpenAfter)
    }
  }

  /** Raise the menu over the globe. Public so finishing a lesson can land here. */
  public open(): void {
    if (!this.stack || this.stack.isOpen || !this.mainMenuPanel) {
      return
    }
    if (this.globe) {
      this.globe.hideMarkers()
      // Placed on open, not at start-up, so the menu faces wherever the viewer
      // is standing now.
      if (this.menuRoot) {
        this.globe.placePanel(this.menuRoot)
      }
    }
    if (this.menuRoot) {
      this.menuRoot.enabled = true
    }
    // Hidden for the same reason a region panel hides it: the menu opens in the
    // same spot, directly over where this button sits.
    this.showLaunchButton(false)
    this.stack.open(this.mainMenuPanel)
  }

  /**
   * Switched off at the object rather than greyed out: an inactive button still
   * reads as something you could press, and this one would be sitting behind a
   * panel where it can't be reached at all.
   */
  private showLaunchButton(visible: boolean): void {
    if (this.launchButton) {
      this.launchButton.getSceneObject().enabled = visible
    }
  }

  /** Fires when the last menu panel closes, leaving the globe on its own. */
  private onClosed(): void {
    if (this.menuRoot) {
      this.menuRoot.enabled = false
    }
    if (this.globe) {
      this.globe.showMarkers()
    }
    this.showLaunchButton(true)
  }
}
