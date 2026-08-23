/**
 * Beat grid for the session.
 *
 * The grid is derived from a free-running clock anchored at start, and the
 * audio is re-anchored to it once per loop, rather than the other way round.
 * That inversion is deliberate: the bundled MP3 carries encoder padding, so its
 * file length is a few tens of milliseconds longer than its musical length. A
 * plain `play(-1)` accumulates that padding on every repeat, and within a
 * handful of loops every beat is graded against the wrong moment.
 */
export class BeatClock {
  private startTime: number = -1
  private running: boolean = false
  private lastEmittedBeat: number = -1

  /**
   * @param bpm tempo of the track
   * @param beatsPerLoop must be a multiple of 8, or the 8-count phase walks
   * @param latencyOffset seconds added to the clock to compensate audio output
   *        latency plus the fact that dancers land slightly before the beat
   */
  constructor(
    public bpm: number,
    public beatsPerLoop: number,
    public latencyOffset: number
  ) {}

  public get beatPeriod(): number {
    return 60 / this.bpm
  }

  public get loopDuration(): number {
    return this.beatPeriod * this.beatsPerLoop
  }

  public get isRunning(): boolean {
    return this.running
  }

  public start(now: number): void {
    this.startTime = now
    this.running = true
    this.lastEmittedBeat = -1
  }

  public stop(): void {
    this.running = false
  }

  /** Continuous position on the beat grid. Beat 1 of the first measure is 0. */
  public phase(now: number): number {
    if (!this.running) {
      return 0
    }
    return (now - this.startTime + this.latencyOffset) / this.beatPeriod
  }

  /** Monotonic beat number since start. */
  public beatNumber(now: number): number {
    return Math.floor(this.phase(now))
  }

  /** 0-7 within the 8-count. Display as +1. */
  public countIndex(now: number): number {
    const beat = this.beatNumber(now)
    return ((beat % 8) + 8) % 8
  }

  /** How many complete loops have elapsed. */
  public loopIndex(now: number): number {
    return Math.floor(this.beatNumber(now) / this.beatsPerLoop)
  }

  /** Clock time at which a given beat number falls. */
  public timeOfBeat(beat: number): number {
    return this.startTime + beat * this.beatPeriod - this.latencyOffset
  }

  /**
   * Returns the beat number if a new beat has started since the last call,
   * otherwise null. Drives the visual pulse and the anchor scheduler.
   */
  public pollBeat(now: number): number | null {
    if (!this.running) {
      return null
    }
    const beat = this.beatNumber(now)
    if (beat === this.lastEmittedBeat) {
      return null
    }
    this.lastEmittedBeat = beat
    return beat
  }
}
