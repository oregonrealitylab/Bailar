import {AxisChannel} from "./AxisChannel"

/**
 * Projects head motion into a body frame captured at calibration, and runs a
 * step detector on each horizontal axis.
 *
 * Positions go in as Lens Studio world units (centimetres); everything this
 * class exposes is in metres.
 */

const CM_TO_M = 0.01

export class BodyFrameTracker {
  /** Side-to-side channel. Negative = left. */
  public readonly lateral: AxisChannel = new AxisChannel()
  /** Forward/back channel. Positive = forward. */
  public readonly sagittal: AxisChannel = new AxisChannel()

  private origin: vec3 = vec3.zero()
  private rightAxis: vec3 = vec3.right()
  private forwardAxis: vec3 = vec3.back()
  private _calibrated: boolean = false
  private _vertical: number = 0

  public get calibrated(): boolean {
    return this._calibrated
  }

  /** Height change from the origin, metres. Positive = up. */
  public get vertical(): number {
    return this._vertical
  }

  /**
   * Lock the body frame. `forward` is the head's gaze direction; it is
   * flattened onto the horizontal plane so pitch can't leak into the axes, and
   * the frame is held fixed from here on — recomputing it per frame would
   * inject head yaw into the signal.
   */
  public calibrate(originWorld: vec3, forward: vec3): void {
    this.origin = originWorld

    let flat = new vec3(forward.x, 0, forward.z)
    if (flat.length < 1e-4) {
      // Looking straight up or down at the moment of calibration — fall back to
      // the world default rather than normalising a zero vector.
      flat = vec3.back()
    }
    this.forwardAxis = flat.normalize()

    // Right-handed, Y-up, -Z-forward: forward × up is body-right. (The reverse
    // order, cross(up, forward), yields body-LEFT in this convention.)
    this.rightAxis = this.forwardAxis.cross(vec3.up()).normalize()

    this.lateral.reset()
    this.sagittal.reset()
    this._calibrated = true
  }

  public reset(): void {
    this._calibrated = false
    this.lateral.reset()
    this.sagittal.reset()
  }

  /**
   * Move the origin to the head's current spot without touching the axes.
   *
   * Used between stages, where the dancer is standing still having just
   * pressed a button — it re-anchors the reference without making them sit
   * through another stillness hold.
   */
  public recenter(currentWorld: vec3): void {
    if (!this._calibrated) {
      return
    }
    this.origin = currentWorld
    this.lateral.reset()
    this.sagittal.reset()
  }

  /**
   * Slowly pull the origin toward the head's current position, to absorb SLAM
   * drift. Only safe at 8-count closure, where net travel should be zero.
   */
  public rebaseline(currentWorld: vec3, alpha: number): void {
    if (!this._calibrated) {
      return
    }
    const delta = currentWorld.sub(this.origin).uniformScale(alpha)
    this.origin = this.origin.add(delta)
  }

  /**
   * @param worldPos head world position, centimetres
   * @param dt seconds since the previous update
   * @param now getTime() seconds
   */
  public update(worldPos: vec3, dt: number, now: number): void {
    if (!this._calibrated || dt <= 0) {
      return
    }
    const offset = worldPos.sub(this.origin).uniformScale(CM_TO_M)
    this.lateral.update(offset.dot(this.rightAxis), dt, now)
    this.sagittal.update(offset.dot(this.forwardAxis), dt, now)
    this._vertical = offset.dot(vec3.up())
  }
}
