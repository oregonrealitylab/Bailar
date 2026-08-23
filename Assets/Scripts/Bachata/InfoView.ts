import {ScrollWindow} from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow"

/**
 * A static article page — title, picture, scrolling body — used by How To Use.
 *
 * Everything on it is authored in the Inspector rather than passed in, because
 * unlike the dance page there is only ever one of these. What the script adds
 * is the scroll sizing and the guarantee that the page reopens at the top.
 */
@component
export class InfoView extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("Body copy. Replace the placeholder once the real writing exists.")
  private bodyText: Text

  @input
  @allowUndefined
  @hint("Scroll window wrapping the body text.")
  private bodyScroll: ScrollWindow

  @input
  @allowUndefined
  @hint("Picture between the title and the body copy.")
  private image: Image

  @input
  @allowUndefined
  @hint("Shown until a real picture is dropped in.")
  private placeholderImage: Texture

  @input
  @hint("Width of the scrollable body area, cm.")
  private bodyWidth: number = 24

  @input
  @hint("Rough height of the body, cm. Sets how far it scrolls.")
  private bodyHeight: number = 60

  @input
  @hint("Fill the body with placeholder copy at start-up. Turn off once real text is authored.")
  private usePlaceholderText: boolean = true

  private static readonly PLACEHOLDER =
    "Stand where you have about two metres of\n" +
    "clear floor in every direction.\n\n" +
    "Pick a region on the globe, then pick a\n" +
    "dance. The coach counts you in and shows\n" +
    "the step you are on.\n\n" +
    "Follow the prompt: step, then hold. The\n" +
    "hold is what the count is listening for, so\n" +
    "landing and settling matters more than\n" +
    "moving quickly.\n\n" +
    "If you would rather practise in front of a\n" +
    "mirror, turn on Mirror Mode in Settings."

  private painted: boolean = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.paint())
    // Also on enable: the page starts switched off, so OnStart never fires for
    // it. Rewinding every time means it reopens at the top rather than
    // wherever it was last left scrolled to.
    this.createEvent("OnEnableEvent").bind(() => this.paint())
  }

  private paint(): void {
    if (this.painted) {
      this.rewind()
      return
    }
    this.painted = true

    if (this.bodyText && this.usePlaceholderText) {
      this.bodyText.text = InfoView.PLACEHOLDER
    }
    if (this.image && this.placeholderImage) {
      this.image.mainPass.baseTex = this.placeholderImage
    }
    this.rewind()
  }

  private rewind(): void {
    if (!this.bodyScroll) {
      return
    }
    this.bodyScroll.scrollDimensions = new vec2(this.bodyWidth, this.bodyHeight)
    // Normalized y of 1 is the top of the content; plain zero is the middle.
    this.bodyScroll.scrollPositionNormalized = new vec2(0, 1)
  }
}
