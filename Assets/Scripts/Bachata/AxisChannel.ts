/**
 * One scalar channel of body-frame motion: filtering, velocity, and the
 * conversion of velocity bursts into discrete step events.
 *
 * Values are in metres, to match the thresholds in the design spec. The same
 * class drives the lateral channel (side basic) and the sagittal one (forward
 * and back basic) — the detection is identical, only the axis differs.
 */

/** One completed burst — a step. */
export type StepEvent = {
  /** getTime() seconds at the peak of the velocity burst. */
  time: number
  /** Sign of the travel along this axis. */
  direction: number
  /** Signed travel across the whole burst, metres. */
  displacement: number
  /** Peak |velocity| during the burst, m/s. */
  peakSpeed: number
}

export class AxisChannel {
  /** |v| must exceed this to open a step burst. */
  public onsetSpeed: number = 0.35
  /** |v| must fall below this (and stay there) to close a burst. */
  public endSpeed: number = 0.15
  /** How long |v| must stay under endSpeed before the burst closes, seconds. */
  public endHold: number = 0.06
  /** Bursts that travel less than this are rejected as sway, metres. */
  public minDisplacement: number = 0.1
  /**
   * How far back to reach for a burst's starting position, seconds.
   *
   * The onset threshold is only crossed once the head is already moving, so
   * sampling the start at the crossing throws away the first chunk of travel
   * and systematically undersizes every step.
   */
  public preRoll: number = 0.12

  private medianBuf: number[] = []
  private _value: number = 0
  private _velocity: number = 0
  private primed: boolean = false
  private peakDecaying: number = 0
  private history: {time: number; value: number}[] = []

  private inBurst: boolean = false
  private burstStart: number = 0
  private burstPeak: number = 0
  private burstPeakTime: number = 0
  private quietSince: number = -1
  private pendingEvent: StepEvent | null = null

  /** Filtered displacement along this axis, metres. */
  public get value(): number {
    return this._value
  }

  /** Filtered velocity along this axis, m/s. */
  public get velocity(): number {
    return this._velocity
  }

  /**
   * Highest |velocity| seen in the last couple of seconds, decaying back to
   * zero. Surfaced in the coach readout so onsetSpeed can be tuned against
   * what a given dancer actually produces.
   */
  public get recentPeakSpeed(): number {
    return this.peakDecaying
  }

  public reset(): void {
    this.medianBuf = []
    this.history = []
    this.primed = false
    this.inBurst = false
    this.pendingEvent = null
    this._value = 0
    this._velocity = 0
    this.peakDecaying = 0
  }

  public update(raw: number, dt: number, now: number): void {
    // 3-frame median knocks out single-frame tracking spikes; the one-pole
    // low-pass after it removes jitter without smearing the velocity edges the
    // step detector relies on.
    const medianed = this.pushMedian(raw)

    if (!this.primed) {
      this._value = medianed
      this._velocity = 0
      this.primed = true
      return
    }

    const previous = this._value
    this._value = lowPass(this._value, medianed, dt, 20)
    const instant = (this._value - previous) / dt
    this._velocity = lowPass(this._velocity, instant, dt, 10)

    const speed = Math.abs(this._velocity)
    this.peakDecaying = Math.max(speed, this.peakDecaying - dt * 0.5)

    this.history.push({time: now, value: this._value})
    const cutoff = now - Math.max(this.preRoll, 0) - 0.1
    while (this.history.length > 1 && this.history[0].time < cutoff) {
      this.history.shift()
    }

    this.detectStep(now, speed)
  }

  /** Returns the most recent completed step, once. */
  public consumeStepEvent(): StepEvent | null {
    const event = this.pendingEvent
    this.pendingEvent = null
    return event
  }

  private detectStep(now: number, speed: number): void {
    if (!this.inBurst) {
      if (speed > this.onsetSpeed) {
        this.inBurst = true
        this.burstStart = this.valueAt(now - this.preRoll)
        this.burstPeak = speed
        this.burstPeakTime = now
        this.quietSince = -1
      }
      return
    }

    if (speed > this.burstPeak) {
      this.burstPeak = speed
      this.burstPeakTime = now
    }

    if (speed >= this.endSpeed) {
      this.quietSince = -1
      return
    }
    if (this.quietSince < 0) {
      this.quietSince = now
      return
    }
    if (now - this.quietSince < this.endHold) {
      return
    }

    this.inBurst = false
    const displacement = this._value - this.burstStart
    if (Math.abs(displacement) >= this.minDisplacement) {
      this.pendingEvent = {
        time: this.burstPeakTime,
        direction: displacement < 0 ? -1 : 1,
        displacement: displacement,
        peakSpeed: this.burstPeak
      }
    }
  }

  /** Newest history sample at or before `time`; the oldest held otherwise. */
  private valueAt(time: number): number {
    if (this.history.length === 0) {
      return this._value
    }
    let chosen = this.history[0].value
    for (const sample of this.history) {
      if (sample.time > time) {
        break
      }
      chosen = sample.value
    }
    return chosen
  }

  private pushMedian(value: number): number {
    this.medianBuf.push(value)
    if (this.medianBuf.length > 3) {
      this.medianBuf.shift()
    }
    if (this.medianBuf.length < 3) {
      return value
    }
    const a = this.medianBuf[0]
    const b = this.medianBuf[1]
    const c = this.medianBuf[2]
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))
  }
}

/** One-pole low-pass, cutoff in Hz, framerate-independent. */
function lowPass(current: number, target: number, dt: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  const alpha = dt / (dt + tau)
  return current + alpha * (target - current)
}
