import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {AxisChannel, StepEvent} from "./AxisChannel"
import {Axis, DetectorSpec, Grading, StageSpec, StepSpec, routineFor} from "./Routines"
import {BeatClock} from "./BeatClock"
import {DanceProgress} from "./DanceCatalog"
import {BodyFrameTracker} from "./BodyFrameTracker"
import {MirrorMotionSource} from "./MirrorMotionSource"
import {Settings} from "./Settings"
import {CoachDisplay, VERDICT_AMBER, VERDICT_GREEN, VERDICT_NEUTRAL, VERDICT_RED} from "./CoachDisplay"
import {StagePrompt} from "./StagePrompt"
import {StepGuideOrb} from "./StepGuideOrb"

/** Counts in one bar of the 8-count these routines are written against. */
const COUNTS_PER_BAR = 8

enum TrainerState {
  Idle,
  Calibrating,
  /** The orb dances the stage through while the dancer just watches. */
  Demo,
  /** The "Ready to try?" panel, waiting on the dancer to press Start. */
  DemoPause,
  CountIn,
  Active,
  Paused,
  StagePause,
  Complete
}

@component
export class BachataTrainer extends BaseScriptComponent {
  @input
  private display: CoachDisplay

  @input
  @allowUndefined
  private stagePrompt: StagePrompt

  @input
  @allowUndefined
  private music: AudioComponent

  @input
  @allowUndefined
  @hint("The coach panel. Hidden while a between-stages message is up.")
  private panelObject: SceneObject

  @ui.group_start("Tempo")
  @input
  @hint("Bachata sits between 108 and 140. The bundled loop is 125.")
  private bpm: number = 125

  @input
  @hint("Must be a multiple of 8 or the 8-count phase walks on every repeat.")
  private beatsPerLoop: number = 16

  @input
  @hint("Seconds added to the beat clock for audio output latency. 0.04-0.12.")
  @widget(new SliderWidget(0, 0.25, 0.01))
  private latencyOffset: number = 0.06
  @ui.group_end

  @ui.group_start("Progression")
  @input
  @hint("Clean 8-counts needed to clear a stage. One 8-count is one Set.")
  private setsPerStage: number = 2

  @input
  @hint("Counts of preparation before grading starts, at every stage.")
  private prepBeats: number = 8

  @ui.group_start("Watch first")
  @input
  @hint(
    "Full 8-counts the orb dances through before the dancer is asked to join \
in, at the start of every stage. Nothing is graded during these. 0 skips \
straight to the count-in."
  )
  @widget(new SliderWidget(0, 4, 1))
  private demoBars: number = 2

  @input
  @hint(
    "Run every second demonstration bar mirrored, so the orb shows the basic \
travelling one way and then the other before handing over. With this off the \
same bar simply repeats, which only ever demonstrates one side."
  )
  private mirrorAlternateBars: boolean = true

  @input
  @hint("Shown on the coach panel while the orb is demonstrating.")
  private demoPrompt: string = "Watch the orb first"

  @input
  @hint("The question on the panel that follows the demonstration.")
  private readyMessage: string = "Ready to try?"

  @input
  @hint("Label on the button that starts the graded attempt.")
  private readyButtonText: string = "Start"

  @input
  @hint("Label on the button that replays the demonstration.")
  private watchAgainText: string = "Watch Again"

  @input
  @hint(
    "Counts of lead-in before the orb starts demonstrating, at the routine's \
own tempo. This is reading time — the dancer is being told to watch something \
that has not started moving yet, and without a pause the first step is gone \
before they have looked up. 0 starts the demonstration immediately."
  )
  @widget(new SliderWidget(0, 8, 1))
  private demoLeadCounts: number = 8
  @ui.group_end
  @ui.group_end

  @ui.group_start("Step thresholds (metres)")
  @input
  @hint("Below this a step counts, but gets a 'bigger steps' nudge.")
  private stepSizeMin: number = 0.15

  @input
  @hint("Above this the step is oversized.")
  private stepSizeMax: number = 0.45

  @input
  @hint("A burst must travel at least this far to register at all.")
  private minStepTravel: number = 0.1
  @ui.group_end

  @ui.group_start("Calibration")
  @input
  @hint("Seconds of stillness required before the session starts.")
  private calibrationHold: number = 2.0

  @input
  @hint("Movement above this restarts the stillness timer, metres.")
  private calibrationSwayLimit: number = 0.05
  @ui.group_end

  @ui.group_start("Grading")
  @input
  @hint(
    "On: a step only scores if it also lands near its beat. Off: the routine is \
self-paced and timing is reported but never gates the verdict."
  )
  private requireBeatTiming: boolean = false
  @ui.group_end

  @ui.group_start("Panel follow")
  @input
  @hint("Panel distance in front of the head at session start, cm.")
  private panelDistance: number = 140

  @input
  @hint(
    "How much of the dancer's travel the panel tracks. 1 keeps it dead ahead; \
lower values let it trail so the panel still reads as a fixed landmark."
  )
  @widget(new SliderWidget(0, 1, 0.05))
  private followAmount: number = 1.0

  @input
  @hint("Seconds for the panel to catch up. Higher slides more lazily.")
  @widget(new SliderWidget(0.05, 1.5, 0.05))
  private followLag: number = 0.35
  @ui.group_end

  @input
  @allowUndefined
  @hint(
    "Body tracker used when Mirror Mode is on in Settings. Leave empty and the \
routine always reads head travel, whatever the setting says."
  )
  private mirrorSource: MirrorMotionSource

  @input
  @allowUndefined
  @hint("Guide orb that dances the step ahead of the dancer. Optional.")
  private orb: StepGuideOrb

  @input
  @hint(
    "Which catalogue entry this routine teaches. Picks the routine out of \
Routines.ts and is the key progress is recorded under."
  )
  private danceName: string = "Bachata"

  @input
  @hint("Label on the button that closes out a finished lesson.")
  private completeButtonText: string = "Complete Lesson"

  @input
  @hint(
    "Beat-graded stages only. How far past the count, in beats, the step's \
window is measured. Dancers do not stop dead on the beat, so a window that \
ends exactly on it straddles the turnaround and reads a reversal as no \
movement at all. Raise it if changes of direction are missed, lower it if \
steps score a beat late."
  )
  @widget(new SliderWidget(0, 0.5, 0.05))
  private beatSampleLag: number = 0.25

  private lessonCompleteEvent: Event<void> = new Event<void>()
  /** Fires when the dancer closes out a finished lesson. */
  public readonly onLessonComplete: PublicApi<void> = this.lessonCompleteEvent.publicApi()

  private camera: WorldCameraFinderProvider
  private tracker: BodyFrameTracker = new BodyFrameTracker()
  private clock: BeatClock
  private state: TrainerState = TrainerState.Idle

  private stillSince: number = -1
  private calibrationSamples: vec3[] = []

  private stageIndex: number = 0
  private stepIndex: number = 0
  private setSteps: number = 0
  private setHits: number = 0
  private clearedSets: number = 0
  // Whether the half of the set currently being graded is the mirrored one.
  private mirroredBar: boolean = false

  private lastLoopIndex: number = 0

  // Beat grading. The axis is recorded every frame so a step can be measured
  // over a window that is not tied to the moment the beat was polled, and the
  // count waiting to be scored is held until that window has actually elapsed.
  private axisHistory: {time: number; value: number}[] = []
  private pendingBeat: number = -1
  private pendingCount: number = 0
  private outOfBoundsSince: number = -1
  private pausedAt: number = -1
  private audioChecked: boolean = false

  // Panel-follow state. The anchor is where the panel was placed at session
  // start; the panel slides along both horizontal body axes from there.
  private panelAnchor: vec3 = vec3.zero()
  private followRightAxis: vec3 = vec3.right()
  private followForwardAxis: vec3 = vec3.back()
  private followOffsetRight: number = 0
  private followOffsetForward: number = 0
  private panelPlaced: boolean = false

  private get stages(): StageSpec[] {
    return routineFor(this.danceName).stages
  }

  private get stage(): StageSpec {
    return this.stages[this.stageIndex]
  }

  /** Stage override if it has one, otherwise the Inspector value. */
  private tuning(): DetectorSpec {
    return this.stage.detector ?? {}
  }

  /**
   * Push this stage's detector settings into both channels.
   *
   * Run whenever the stage changes rather than once at start-up: a march and a
   * step-and-hold want quite different thresholds, and a routine can mix them.
   */
  private applyStageTuning(): void {
    const spec = this.tuning()
    for (const channel of [this.tracker.lateral, this.tracker.sagittal]) {
      channel.minDisplacement = spec.minDisplacement ?? this.minStepTravel
      if (spec.onsetSpeed !== undefined) {
        channel.onsetSpeed = spec.onsetSpeed
      }
      if (spec.endSpeed !== undefined) {
        channel.endSpeed = spec.endSpeed
      }
      if (spec.endHold !== undefined) {
        channel.endHold = spec.endHold
      }
    }
  }

  /** The channel the current stage grades against. */
  private get gradedChannel(): AxisChannel {
    return this.stage.axis === Axis.Lateral ? this.tracker.lateral : this.tracker.sagittal
  }

  /** The channel the dancer is *not* meant to be travelling along. */
  private get offAxisChannel(): AxisChannel {
    return this.stage.axis === Axis.Lateral ? this.tracker.sagittal : this.tracker.lateral
  }

  onAwake(): void {
    this.camera = WorldCameraFinderProvider.getInstance()
    this.clock = new BeatClock(this.bpm, this.beatsPerLoop, this.latencyOffset)
    this.tracker.lateral.minDisplacement = this.minStepTravel
    this.tracker.sagittal.minDisplacement = this.minStepTravel

    // The trainer is enabled by the onboarding deck, and OnStart does not fire
    // while the object is disabled — so kick off from whichever comes first.
    this.createEvent("OnStartEvent").bind(() => this.begin())
    this.createEvent("OnEnableEvent").bind(() => this.restart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /**
   * Tear the session down and go back to Idle.
   *
   * Called when the dancer leaves the tutorial early. Everything that outlives
   * a screen — the beat clock, the music, the tracker's body frame — has to be
   * stopped by hand, and the state has to land back on Idle specifically:
   * `begin` refuses to run unless it is, so without this the trainer would come
   * back mid-routine the next time the dance is opened.
   */
  public abort(): void {
    this.state = TrainerState.Idle
    if (this.orb) {
      this.orb.show(false)
    }
    // Reachable before the trainer has ever been enabled — the exit button on
    // the onboarding slides can fire while this object is still switched off,
    // and onAwake, which builds the clock, has not run at that point.
    if (this.clock) {
      this.clock.stop()
    }
    this.stopMusic()
    this.tracker.reset()

    this.calibrationSamples = []
    this.stillSince = -1
    this.outOfBoundsSince = -1
    this.pausedAt = -1
    this.panelPlaced = false

    this.showCoachPanel(false)
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
  }

  /**
   * Switched back on: start the lesson over rather than resume it.
   *
   * Re-entering a dance should always open at its beginning. Leaving by the X
   * aborts cleanly, but anything that gets out by another road leaves state
   * behind, and `begin` refuses to run unless the trainer is idle — so the next
   * visit would come up holding the last one's panel with nothing behind it.
   */
  private restart(): void {
    if (this.state !== TrainerState.Idle) {
      this.abort()
    }
    this.begin()
  }

  private begin(): void {
    // OnEnable can beat OnAwake, so bail until the camera reference exists.
    if (this.state !== TrainerState.Idle || !this.camera) {
      return
    }
    this.stageIndex = 0
    this.clearedSets = 0
    this.placePanelAndPrompt()
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
    this.enterCalibrating()
  }

  // ─── State entry ──────────────────────────────────────────────────────────

  private enterCalibrating(): void {
    this.state = TrainerState.Calibrating
    this.applyStageTuning()
    this.showCoachPanel(true)
    this.tracker.reset()
    // Recalibration usually happens because the dancer has drifted well off
    // their original spot, so the panel is brought to them before the "hold
    // still" instructions go up — otherwise they are being asked to read a
    // panel that is off to one side of them.
    this.placePanelAndPrompt()
    this.calibrationSamples = []
    this.stillSince = -1
    this.display.setCount("")
    this.display.setStage(this.stage.name)
    this.display.setPrompt("Feet together, face forward")
    this.display.setVerdict("Hold still...", VERDICT_NEUTRAL)
  }

  /**
   * Let the orb dance the stage through while the dancer watches.
   *
   * A stage's pattern is far easier to copy than to read: "left, hold, left,
   * hold" as a sentence takes a moment to parse, where the same thing shown
   * once is obvious. Nothing is graded and nothing is expected of the dancer
   * here — the music and the beat run purely so the demonstration happens at
   * the tempo they are about to dance at.
   */
  private enterDemo(): void {
    if (this.demoBars <= 0) {
      this.enterCountIn()
      return
    }
    this.state = TrainerState.Demo
    this.showCoachPanel(true)
    this.stepIndex = 0
    this.setSteps = 0
    this.setHits = 0
    this.mirroredBar = false
    this.clock.start(getTime())
    this.lastLoopIndex = 0
    this.startMusic()

    if (this.orb) {
      this.orb.show(true)
      // Back to the middle before it starts: a demonstration that begins from
      // wherever the last stage left the orb reads as part of the old pattern.
      this.orb.setStage(this.stage)
      this.orb.setMirrored(false)
    }

    this.display.setStage(this.stageLabel())
    this.display.setPrompt(this.demoPrompt)
    this.display.setVerdict("Just watch — nothing to do yet", VERDICT_NEUTRAL)
  }

  /**
   * The demonstration is over: hold everything still and ask for the go-ahead.
   *
   * The music and clock stop rather than running under the panel, so the
   * dancer is not being asked to read a question while a beat is pushing them
   * to move.
   */
  private finishDemo(): void {
    this.state = TrainerState.DemoPause
    this.clock.stop()
    this.stopMusic()
    this.display.setCount("")

    if (this.orb) {
      this.orb.show(false)
    }

    if (!this.stagePrompt) {
      // Nothing to ask on, so carry straight on rather than stalling here.
      this.enterCountIn()
      return
    }
    this.showCoachPanel(false)
    this.stagePrompt.setWorldPosition(this.panelAnchor)
    this.stagePrompt.show(
      this.readyMessage,
      this.readyButtonText,
      () => this.startAttempt(),
      this.watchAgainText,
      () => this.watchAgain()
    )
  }

  /** Watch Again on the "Ready to try?" panel: run the demonstration over. */
  private watchAgain(): void {
    if (this.state !== TrainerState.DemoPause) {
      return
    }
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
    this.enterDemo()
  }

  /** Start button on the "Ready to try?" panel. */
  private startAttempt(): void {
    if (this.state !== TrainerState.DemoPause) {
      return
    }
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
    this.showCoachPanel(true)
    this.enterCountIn()
  }

  /**
   * A full 8-count of preparation. Nothing is graded here — the music and the
   * count run so the dancer can find the beat, and grading opens on the very
   * next 1.
   */
  private enterCountIn(): void {
    this.state = TrainerState.CountIn
    this.showCoachPanel(true)
    this.stepIndex = 0
    this.setSteps = 0
    this.setHits = 0
    this.mirroredBar = false
    this.clock.start(getTime())
    this.lastLoopIndex = 0
    this.startMusic()
    this.display.setStage(this.stageLabel())
    this.display.setPrompt("Get ready — " + this.stage.name.toLowerCase())
    this.display.setVerdict("Grading starts on the next 1", VERDICT_NEUTRAL)
  }

  private enterActive(): void {
    this.state = TrainerState.Active
    if (this.orb) {
      this.orb.show(true)
      // Whatever the demonstration was doing, grading follows the routine as
      // written.
      this.orb.setMirrored(false)
    }
    // Nothing measured yet to judge the opening count against.
    this.axisHistory = []
    this.pendingBeat = -1
    this.stepIndex = 0
    this.setSteps = 0
    this.setHits = 0
    this.mirroredBar = false
    this.display.setVerdict("Go!", VERDICT_GREEN)
    this.promptNextStep()
  }

  private enterPaused(reason: string): void {
    this.state = TrainerState.Paused
    this.clock.stop()
    this.stopMusic()
    this.display.setCount("")
    this.display.setPrompt(reason)
    this.display.setVerdict("Return to the middle to recalibrate", VERDICT_AMBER)
    this.outOfBoundsSince = -1
    this.pausedAt = -1
  }

  // ─── Frame loop ───────────────────────────────────────────────────────────

  private onUpdate(): void {
    const now = getTime()
    const dt = getDeltaTime()
    const dancer = this.dancerPosition()

    // Tracking and panel-follow run in every state once the body frame is
    // locked, so the panel holds its offset from the dancer even while paused
    // or sitting between stages — not only while a routine is being graded.
    if (this.tracker.calibrated) {
      this.tracker.update(dancer, dt, now)
      this.updatePanelFollow(dt)
      this.recordAxis(now)

      if (this.state !== TrainerState.Active) {
        // Discard anything the detector produced while nothing was being
        // graded, so a step taken during a pause can't be scored on resume.
        this.tracker.lateral.consumeStepEvent()
        this.tracker.sagittal.consumeStepEvent()
      }
    }

    switch (this.state) {
      case TrainerState.Calibrating:
        this.updateCalibrating(dancer, now)
        return
      case TrainerState.Demo:
        // Tested before the count is handed over, not after: checking
        // afterwards lets the first count of the next bar through, and the orb
        // takes one extra step out of the pattern before it stops. Counted in
        // bars rather than beats so it always finishes the phrase it started.
        if (this.clock.beatNumber(now) >= this.demoLeadCounts + this.demoBars * COUNTS_PER_BAR) {
          this.finishDemo()
          return
        }
        this.updateBeat(now)
        return
      case TrainerState.DemoPause:
        return
      case TrainerState.CountIn:
        this.updateBeat(now)
        if (this.clock.beatNumber(now) >= this.prepBeats) {
          this.enterActive()
        }
        this.updateReadout()
        return
      case TrainerState.Active:
        this.updateBeat(now)
        this.resolvePendingBeat(now)
        this.updateSteps(now)
        this.updateBounds(now)
        this.updateReadout()
        return
      case TrainerState.Paused:
        this.updatePaused(now)
        return
      default:
        return
    }
  }

  /**
   * Where the routine should consider the dancer to be, in world centimetres.
   *
   * Normally that is the head, since the camera rides on it and travel around
   * the room is exactly what the step detector wants. Mirror Mode swaps in a
   * body tracker watching the dancer's reflection, which reads the same axes
   * from how the body moves rather than from how far the room slides past.
   *
   * Falls back to the head whenever the body is not actually being tracked —
   * a dropout should cost accuracy, not stop the lesson.
   */
  private dancerPosition(): vec3 {
    if (Settings.mirrorMode && this.mirrorSource && this.mirrorSource.available) {
      return this.mirrorSource.getPosition()
    }
    return this.camera.getWorldPosition()
  }

  // ─── Calibration ──────────────────────────────────────────────────────────

  private updateCalibrating(dancer: vec3, now: number): void {
    this.calibrationSamples.push(dancer)
    if (this.calibrationSamples.length > 120) {
      this.calibrationSamples.shift()
    }

    const swayMetres = this.horizontalSway() * 0.01
    if (swayMetres > this.calibrationSwayLimit) {
      // Too much movement — drop the buffer and start the hold over.
      this.stillSince = -1
      this.calibrationSamples = [dancer]
      this.display.setVerdict("Hold still...", VERDICT_AMBER)
      return
    }

    if (this.stillSince < 0) {
      this.stillSince = now
    }

    const held = now - this.stillSince
    if (held < this.calibrationHold) {
      const remaining = Math.max(0, this.calibrationHold - held)
      this.display.setVerdict("Calibrating... " + remaining.toFixed(1) + "s", VERDICT_NEUTRAL)
      return
    }

    this.tracker.calibrate(this.medianSample(), this.camera.getTransform().back)
    // Anchor the panel to the spot and the facing just captured. The tracker's
    // offsets are zero again from here, so an anchor left where the previous
    // calibration put it would park the panel in front of where the dancer used
    // to stand — and the axes the panel slides along would no longer be the
    // axes the tracker is reporting against.
    this.placePanelAndPrompt()
    this.enterDemo()
  }

  /** Largest horizontal deviation from the mean of the buffer, centimetres. */
  private horizontalSway(): number {
    const count = this.calibrationSamples.length
    if (count < 2) {
      return 0
    }
    let sumX = 0
    let sumZ = 0
    for (const sample of this.calibrationSamples) {
      sumX += sample.x
      sumZ += sample.z
    }
    const meanX = sumX / count
    const meanZ = sumZ / count

    let worst = 0
    for (const sample of this.calibrationSamples) {
      const dx = sample.x - meanX
      const dz = sample.z - meanZ
      const distance = Math.sqrt(dx * dx + dz * dz)
      if (distance > worst) {
        worst = distance
      }
    }
    return worst
  }

  /** Per-axis median of the stillness buffer — robust to tracking spikes. */
  private medianSample(): vec3 {
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    for (const sample of this.calibrationSamples) {
      xs.push(sample.x)
      ys.push(sample.y)
      zs.push(sample.z)
    }
    return new vec3(median(xs), median(ys), median(zs))
  }

  // ─── Beat grid ────────────────────────────────────────────────────────────

  private updateBeat(now: number): void {
    const beat = this.clock.pollBeat(now)
    if (beat === null) {
      return
    }

    const count = this.clock.countIndex(now) + 1
    this.display.setCount(String(count))

    // Led from the count rather than from the dancer's own movement: the orb is
    // a guide, so it has to show the step before it happens, not echo it after.
    if (this.state === TrainerState.Demo) {
      const sinceStart = this.clock.beatNumber(now)
      if (sinceStart < this.demoLeadCounts) {
        // Still reading time. Count down to the moment the orb sets off, and
        // hand it nothing — a guide that moves while the dancer is being told
        // to watch it has already lost them.
        this.display.setCount(String(this.demoLeadCounts - sinceStart))
        return
      }

      // Alternate demonstration bars run mirrored, so the basic is shown to
      // both sides. Decided on the 1, because it has to be in place before the
      // first step of the bar is handed to the orb.
      if (this.orb && count === 1) {
        const bar = Math.floor((sinceStart - this.demoLeadCounts) / COUNTS_PER_BAR)
        this.orb.setMirrored(this.mirrorAlternateBars && bar % 2 === 1)
      }
    }

    if (this.orb && (this.state === TrainerState.Active || this.state === TrainerState.Demo)) {
      this.orb.onCount(count, this.stage, this.clock.beatPeriod, now)
    }

    if (this.state === TrainerState.Active && this.stage.grading === Grading.Beat) {
      // Queued, not scored: the window this count is judged over runs past the
      // beat itself, so there is nothing to measure yet.
      this.pendingBeat = beat
      this.pendingCount = count
    }
    // Downbeats get a brighter pulse so the 1 and the 5 read at a glance.
    this.display.pulse(count === 1 || count === 5 ? 1.0 : 0.55)

    // Re-anchor the audio at every loop boundary rather than trusting the
    // file's own loop, whose encoder padding would walk the phase.
    const loop = this.clock.loopIndex(now)
    if (loop !== this.lastLoopIndex) {
      this.lastLoopIndex = loop
      this.startMusic()
      this.rebaselineOnClosure()
    }
  }

  /**
   * Over a full 8-count net travel is zero on both axes, so closure is the one
   * moment where the head should be back on the origin — which makes it the
   * only safe moment to absorb SLAM drift.
   *
   * The closure test is the whole point. Blending unconditionally drags the
   * origin toward wherever the dancer happens to be standing, which is the
   * opposite of drift correction.
   */
  private rebaselineOnClosure(): void {
    // Never while a beat-graded stage is running. Absorbing drift moves the
    // origin, which shifts every reading taken against it — and the loop
    // boundary lands inside the window count 1 is measured over, so the step
    // would be scored against a jump the dancer never made.
    if (this.stage.grading === Grading.Beat) {
      return
    }
    if (Math.abs(this.tracker.lateral.value) > 0.15 || Math.abs(this.tracker.sagittal.value) > 0.15) {
      return
    }
    this.tracker.rebaseline(this.dancerPosition(), 0.15)
  }

  private startMusic(): void {
    if (!this.music) {
      return
    }
    this.music.stop(false)
    this.music.play(1)

    if (!this.audioChecked) {
      this.audioChecked = true
      this.reportAudioFit()
    }
  }

  private stopMusic(): void {
    if (this.music) {
      this.music.stop(false)
    }
  }

  /**
   * Compare the track's real length against the beat grid once, at first play.
   *
   * A loop that isn't an exact multiple of 8 beats walks its phase on every
   * repeat, and every subsequent measure gets graded against the wrong beat —
   * the hardest failure to spot by ear, because each individual loop sounds
   * fine.
   */
  private reportAudioFit(): void {
    const trackLength = this.music.duration
    if (trackLength <= 0) {
      return
    }
    const expected = this.clock.loopDuration
    const drift = trackLength - expected
    print(
      "[Bachata] track " +
        trackLength.toFixed(3) +
        "s vs " +
        this.beatsPerLoop +
        " beats @ " +
        this.bpm +
        " BPM = " +
        expected.toFixed(3) +
        "s (drift " +
        (drift * 1000).toFixed(0) +
        " ms/loop)"
    )
  }

  // ─── Step grading ─────────────────────────────────────────────────────────

  private updateSteps(now: number): void {
    // Only the stage's own axis is graded. A step detected on the other axis
    // is left alone rather than scored as a mistake — drifting a little
    // forward while learning the side basic is not an error worth flagging.
    const event = this.gradedChannel.consumeStepEvent()
    this.offAxisChannel.consumeStepEvent()
    // A beat-graded stage scores in updateBeat instead. The events are still
    // drained above so a stale one can't surface later.
    if (event === null || this.stage.grading === Grading.Beat) {
      return
    }
    this.gradeStep(event)
  }

  /** Keep a short trail of the graded axis, long enough to look a step back. */
  private recordAxis(now: number): void {
    if (this.state !== TrainerState.Active || this.stage.grading !== Grading.Beat) {
      return
    }
    this.axisHistory.push({time: now, value: this.gradedChannel.value})

    const cutoff = now - this.clock.beatPeriod * 3
    while (this.axisHistory.length > 1 && this.axisHistory[0].time < cutoff) {
      this.axisHistory.shift()
    }
  }

  /** Newest reading at or before `time`, or null if the trail starts after it. */
  private axisAt(time: number): number | null {
    if (this.axisHistory.length === 0 || this.axisHistory[0].time > time) {
      return null
    }
    let chosen = this.axisHistory[0].value
    for (const sample of this.axisHistory) {
      if (sample.time > time) {
        break
      }
      chosen = sample.value
    }
    return chosen
  }

  /**
   * Score a queued count once its window has passed.
   *
   * The window is one beat long and ends `beatSampleLag` beats *after* the
   * count. That offset is the whole point. A dancer does not stop dead on the
   * beat — they are still finishing the last step as the next one begins, so a
   * window ending exactly on the count straddles the turnaround. On a
   * continuing step that barely matters, but on a change of direction the two
   * halves cancel and the count reads as no movement at all. Merengue changes
   * direction on 1 and on 5, which is exactly where that showed up. Ending the
   * window a little later puts the whole reversal on one side of it.
   */
  private resolvePendingBeat(now: number): void {
    if (this.pendingBeat < 0) {
      return
    }
    const period = this.clock.beatPeriod
    const end = this.clock.timeOfBeat(this.pendingBeat) + this.beatSampleLag * period
    if (now < end) {
      return
    }

    const count = this.pendingCount
    this.pendingBeat = -1

    const after = this.axisAt(end)
    const before = this.axisAt(end - period)
    // The opening count of a routine has no full window behind it.
    if (after === null || before === null) {
      return
    }
    this.scoreBeat(count, after - before)
  }

  /**
   * Judge one count's travel along the stage's axis.
   *
   * Every count carries a step in a march, so the question is never "did a step
   * happen" — it is "did the dancer go the right way, by a sensible amount".
   */
  private scoreBeat(count: number, delta: number): void {
    const expected = this.expectedStep(count - 1)
    if (!expected) {
      return
    }

    const size = Math.abs(delta)
    const wentRightWay = delta * expected.direction > 0
    const min = this.tuning().stepSizeMin ?? this.stepSizeMin
    const max = this.tuning().stepSizeMax ?? this.stepSizeMax

    let text: string
    let color: vec4
    let clean: boolean

    if (!wentRightWay || size < min) {
      // Standing still and going the wrong way are both simply a missed count
      // here; what the dancer needs to hear is which way to go next.
      text = wentRightWay ? "Bigger steps — " + expected.label : "Go " + expected.label
      color = wentRightWay ? VERDICT_AMBER : VERDICT_RED
      clean = false
    } else if (size > max) {
      text = "Smaller steps"
      color = VERDICT_AMBER
      clean = false
    } else {
      text = "Nice"
      color = VERDICT_GREEN
      clean = true
    }

    this.reportGrade(text + "  (" + Math.round(size * 100) + " cm)", color)

    this.setSteps++
    if (clean) {
      this.setHits++
    }

    // The set is the musical bar, so it closes on the 8 whatever happened
    // during it — a march has no way to fall out of step with the count.
    if (count >= this.stage.steps.length) {
      this.closeBar()
      return
    }
    this.stepIndex = count
    this.promptNextStep()
  }

  /**
   * Put one step's grade on every surface that reports it.
   *
   * The orb is coloured from the same call as the panel so the two can never
   * disagree about how a step went.
   */
  private reportGrade(text: string, color: vec4): void {
    this.display.setVerdict(text, color)
    this.display.flash(color)
    if (this.orb) {
      this.orb.setAccuracy(color)
    }
  }

  /**
   * What the dancer is being asked for at `index`, mirror included.
   *
   * The label is taken from whichever authored step travels that way, so a
   * mirrored LEFT is announced as RIGHT rather than as a negated LEFT.
   */
  private expectedStep(index: number): StepSpec | null {
    const step = this.stage.steps[index]
    if (!step) {
      return null
    }
    if (!this.mirroredBar) {
      return step
    }
    const direction = -step.direction
    const twin = this.stage.steps.find((candidate) => candidate.direction === direction)
    return {direction: direction, count: step.count, label: twin ? twin.label : step.label}
  }

  /** Steps in a full set — twice the pattern when the mirror is required too. */
  private stepsPerSet(): number {
    return this.stage.steps.length * (this.stage.mirroredRepeat ? 2 : 1)
  }

  /**
   * Close the bar just graded, moving into the mirror if one is owed.
   *
   * Returns true when the set is finished and the caller should stop.
   */
  private closeBar(): boolean {
    this.stepIndex = 0
    if (this.stage.mirroredRepeat && !this.mirroredBar) {
      // Half done: same pattern, other way round.
      this.mirroredBar = true
      if (this.orb) {
        this.orb.setMirrored(true)
      }
      this.promptNextStep()
      return false
    }
    this.mirroredBar = false
    if (this.orb) {
      this.orb.setMirrored(false)
    }
    this.completeSet()
    return true
  }

  private gradeStep(event: StepEvent): void {
    const expected = this.expectedStep(this.stepIndex)
    if (!expected) {
      return
    }
    const size = Math.abs(event.displacement)

    if (event.direction !== expected.direction) {
      this.reportGrade("Wrong way — go " + expected.label, VERDICT_RED)
      return
    }

    const timing = this.timingVerdict(event)
    const timingFails = this.requireBeatTiming && timing.missed

    let text: string
    let color: vec4
    let clean: boolean

    // Amber is reserved for a step that went the right way and only missed its
    // moment. A step of the wrong size did not travel the way the basic
    // travels, so it reads red alongside going the wrong way entirely.
    if (size < (this.tuning().stepSizeMin ?? this.stepSizeMin)) {
      text = "Bigger steps"
      color = VERDICT_RED
      clean = false
    } else if (size > (this.tuning().stepSizeMax ?? this.stepSizeMax)) {
      text = "Smaller steps"
      color = VERDICT_RED
      clean = false
    } else if (timing.missed) {
      // Coloured off the timing itself rather than off `timingFails`, so a step
      // that lands early or late always reads amber. Whether that also costs
      // the set stays with `requireBeatTiming` — the colour is feedback, the
      // flag is the rule.
      text = timing.label
      color = VERDICT_AMBER
      clean = !timingFails
    } else {
      text = timing.label === "" ? "Nice" : "Nice — " + timing.label
      color = VERDICT_GREEN
      clean = true
    }

    this.reportGrade(text + "  (" + Math.round(size * 100) + " cm)", color)

    this.setSteps++
    if (clean) {
      this.setHits++
    }

    this.stepIndex++
    if (this.stepIndex >= this.stage.steps.length) {
      this.closeBar()
      return
    }
    this.promptNextStep()
  }

  /**
   * One full pass of the stage's four steps. It only counts toward the stage
   * if every step in it was clean — a set is meant to certify the whole
   * 8-count, not four independent attempts.
   */
  private completeSet(): void {
    const clean = this.setHits >= this.stepsPerSet()
    this.setSteps = 0
    this.setHits = 0

    if (!clean) {
      this.display.setVerdict("Set missed — run it again", VERDICT_AMBER)
      this.display.setStage(this.stageLabel())
      this.promptNextStep()
      return
    }

    this.clearedSets++
    this.display.setStage(this.stageLabel())

    if (this.clearedSets >= this.setsPerStage) {
      this.onStageComplete()
      return
    }

    this.display.setVerdict("Set " + this.clearedSets + " of " + this.setsPerStage + " — clean!", VERDICT_GREEN)
    this.display.flash(VERDICT_GREEN)
    this.promptNextStep()
  }

  private onStageComplete(): void {
    this.clock.stop()
    this.stopMusic()
    this.showCoachPanel(false)
    if (this.orb) {
      this.orb.show(false)
    }

    const message = this.stage.completeMessage
    const isLast = this.stageIndex >= this.stages.length - 1

    // Banked as each stage falls rather than only at the end, so a dancer who
    // walks away half-way keeps what they earned.
    DanceProgress.completeStage(this.danceName, this.stageIndex)

    if (!this.stagePrompt) {
      // Nothing wired to show the message on — keep the result on the coach
      // panel rather than silently doing nothing.
      this.showCoachPanel(true)
      this.state = isLast ? TrainerState.Complete : TrainerState.StagePause
      this.display.setPrompt(message)
      return
    }

    this.stagePrompt.setWorldPosition(this.panelAnchor)
    if (isLast) {
      this.state = TrainerState.Complete
      this.stagePrompt.show(message, this.completeButtonText, () => this.finishLesson())
      return
    }

    this.state = TrainerState.StagePause
    this.stagePrompt.show(message, "Start", () => this.beginNextStage())
  }

  /**
   * Close out a finished lesson: bank the dance and hand the screen back.
   *
   * The progress write is repeated here even though every stage already
   * recorded itself, because this is the moment the dancer actually says they
   * are done — and it costs nothing to be certain the tick is there before the
   * Tracker is next opened.
   */
  private finishLesson(): void {
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
    DanceProgress.complete(this.danceName)
    this.abort()
    this.lessonCompleteEvent.invoke()
  }

  private beginNextStage(): void {
    if (this.state !== TrainerState.StagePause) {
      return
    }
    if (this.stagePrompt) {
      this.stagePrompt.hide()
    }
    this.stageIndex++
    this.clearedSets = 0
    this.applyStageTuning()
    // The next stage travels along a different axis, and the orb has no other
    // way to learn that — without this it keeps sliding side to side through
    // the forward-and-back basic.
    if (this.orb) {
      this.orb.setStage(this.stage)
    }

    // The dancer is standing still having just pressed a button, so re-anchor
    // the origin here instead of making them sit through another hold. The
    // body axes captured at calibration are still valid.
    this.tracker.recenter(this.dancerPosition())
    this.rebaseAnchorToCurrentPanel()
    this.enterDemo()
  }

  /** Signed error against the nearest beat, classified per the spec's table. */
  private timingVerdict(event: StepEvent): {label: string; missed: boolean} {
    if (!this.clock.isRunning) {
      return {label: "", missed: false}
    }
    const phase = this.clock.phase(event.time)
    const nearest = Math.round(phase)
    const errorSeconds = (phase - nearest) * this.clock.beatPeriod
    const magnitude = Math.abs(errorSeconds)

    if (magnitude < 0.1) {
      return {label: "perfect timing", missed: false}
    }
    if (magnitude < 0.18) {
      return {label: "good timing", missed: false}
    }
    if (magnitude < 0.24) {
      return {label: errorSeconds < 0 ? "a touch early" : "a touch late", missed: false}
    }
    return {label: errorSeconds < 0 ? "early" : "late", missed: true}
  }

  /**
   * The way the next step travels, as an arrow rather than a word.
   *
   * A dancer mid-basic is reading this out of the corner of their eye, and a
   * shape registers in that glance where "LEFT" has to be read. Forward and
   * back take up and down, which is the only sensible pair on a panel facing
   * the dancer — there is no way to draw "towards you" flat.
   *
   * Comfortaa carries all four of these; the panel font is checked, not
   * assumed, because a missing glyph would render as a blank box and the
   * dancer would be left with no instruction at all.
   */
  private arrowFor(step: StepSpec): string {
    if (this.stage.axis === Axis.Lateral) {
      return step.direction < 0 ? "\u2190" : "\u2192"
    }
    return step.direction > 0 ? "\u2191" : "\u2193"
  }

  private promptNextStep(): void {
    const next = this.expectedStep(this.stepIndex)
    if (!next) {
      return
    }
    this.display.setPrompt(this.arrowFor(next) + "   (on " + next.count + ")")
  }

  private stageLabel(): string {
    return this.stage.name + " · Set " + this.clearedSets + "/" + this.setsPerStage
  }

  // ─── Panel ────────────────────────────────────────────────────────────────

  private showCoachPanel(visible: boolean): void {
    if (this.panelObject) {
      this.panelObject.enabled = visible
    }
  }

  /**
   * Put the panel directly in front of the dancer and rebuild the axes it
   * slides along.
   *
   * Run at session start and again on every calibration, not once per session.
   * Calibration moves the tracker's origin to wherever the dancer is standing
   * and zeroes its offsets, so the anchor has to move with it; and it rebuilds
   * the body frame from the current gaze, so the follow axes have to be rebuilt
   * from the same gaze or the panel would slide along the direction the dancer
   * was facing at some earlier point in the session.
   */
  private placePanel(): void {
    if (!this.panelObject) {
      return
    }
    const headPosition = this.camera.getWorldPosition()
    const gaze = this.camera.getTransform().back
    const flat = new vec3(gaze.x, 0, gaze.z)
    const forward = flat.length < 1e-4 ? vec3.back() : flat.normalize()

    this.panelAnchor = headPosition.add(forward.uniformScale(this.panelDistance))
    this.followForwardAxis = forward
    // Same handedness note as the tracker: forward × up is body-right here.
    this.followRightAxis = forward.cross(vec3.up()).normalize()
    this.followOffsetRight = 0
    this.followOffsetForward = 0
    this.panelPlaced = true

    this.panelObject.getTransform().setWorldPosition(this.panelAnchor)
  }

  /** Place the panel, and keep the stage prompt on the same spot. */
  private placePanelAndPrompt(): void {
    this.placePanel()
    if (this.stagePrompt) {
      this.stagePrompt.setWorldPosition(this.panelAnchor)
    }
    // The orb is anchored on the same beat as the panel but stands much closer,
    // so it carries its own distance rather than sharing the panel's.
    if (this.orb) {
      this.orb.place(this.camera.getWorldPosition(), this.camera.getTransform().back)
      this.orb.setStage(this.stage)
    }
  }

  /**
   * Fold the current follow offsets into the anchor and zero them.
   *
   * Called alongside `recenter`, which moves the tracker origin to wherever the
   * dancer is standing. Offsets are measured from that origin, so zeroing them
   * without moving the anchor to match would snap the panel back to its
   * session-start spot.
   */
  private rebaseAnchorToCurrentPanel(): void {
    this.panelAnchor = this.panelAnchor
      .add(this.followRightAxis.uniformScale(this.followOffsetRight))
      .add(this.followForwardAxis.uniformScale(this.followOffsetForward))
    this.followOffsetRight = 0
    this.followOffsetForward = 0
  }

  /**
   * Slide the panel to stay with the dancer on both horizontal axes, without
   * ever rotating it.
   *
   * Depth tracks as well as width, so stepping toward the panel pushes it back
   * and stepping away draws it in — the gap the dancer sees stays constant
   * through the whole routine. Height is the one component still pinned to the
   * anchor: the head bobs on every hip pop, and letting the panel chase that
   * would make it jitter vertically at the beat rate.
   */
  private updatePanelFollow(dt: number): void {
    if (!this.panelPlaced || !this.panelObject || dt <= 0) {
      return
    }
    // Metres to centimetres — the tracker reports in metres, scene units are cm.
    const targetRight = this.tracker.lateral.value * 100 * this.followAmount
    const targetForward = this.tracker.sagittal.value * 100 * this.followAmount

    const alpha = this.followLag <= 0 ? 1 : Math.min(1, dt / this.followLag)
    this.followOffsetRight += (targetRight - this.followOffsetRight) * alpha
    this.followOffsetForward += (targetForward - this.followOffsetForward) * alpha

    const position = this.panelAnchor
      .add(this.followRightAxis.uniformScale(this.followOffsetRight))
      .add(this.followForwardAxis.uniformScale(this.followOffsetForward))
    this.panelObject.getTransform().setWorldPosition(position)

    // Handed the same already-smoothed offsets, so the orb and the panel share
    // one lag rather than each running their own and drifting apart.
    if (this.orb) {
      this.orb.follow(
        this.followRightAxis,
        this.followForwardAxis,
        this.followOffsetRight,
        this.followOffsetForward
      )
    }
  }

  // ─── Play-area guards ─────────────────────────────────────────────────────

  private updateBounds(now: number): void {
    // The envelope is stage-relative: 2d of travel along the graded axis is the
    // routine, while the same distance on the other axis means the dancer has
    // wandered off their spot.
    const along = Math.abs(this.gradedChannel.value)
    const across = Math.abs(this.offAxisChannel.value)

    if (along > 1.2) {
      this.enterPaused("Too far from centre")
      return
    }
    if (across <= 0.6) {
      this.outOfBoundsSince = -1
      return
    }
    if (this.outOfBoundsSince < 0) {
      this.outOfBoundsSince = now
      return
    }
    if (now - this.outOfBoundsSince > 0.5) {
      this.enterPaused("You've drifted off your spot")
    }
  }

  private updatePaused(now: number): void {
    // Hold the reason on screen long enough to read, then drop back into
    // calibration — which waits for stillness on its own.
    if (this.pausedAt < 0) {
      this.pausedAt = now
      return
    }
    if (now - this.pausedAt > 1.5) {
      this.pausedAt = -1
      this.enterCalibrating()
    }
  }

  // ─── Readout ──────────────────────────────────────────────────────────────

  private updateReadout(): void {
    const channel = this.gradedChannel
    const axisName = this.stage.axis === Axis.Lateral ? "lat" : "fwd"
    const centimetres = Math.round(channel.value * 100)
    this.display.setDebug(
      axisName +
        " " +
        (centimetres >= 0 ? "+" : "") +
        centimetres +
        " cm   v " +
        channel.velocity.toFixed(2) +
        " m/s   peak " +
        channel.recentPeakSpeed.toFixed(2) +
        "   step " +
        (this.stepIndex + 1) +
        "/" +
        this.stage.steps.length
    )
  }
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }
  return (sorted[middle - 1] + sorted[middle]) * 0.5
}
