/**
 * What each dance's tutorial asks the dancer to do, as data.
 *
 * Kept apart from the trainer so a new dance is a new entry here rather than a
 * new copy of the state machine. The trainer reads whichever routine matches
 * the dance it was handed.
 */

export enum Axis {
  Lateral,
  Sagittal
}

export type StepSpec = {
  /** Expected sign of travel along the stage's axis. */
  direction: number
  /** Which count of the 8 this step falls on. */
  count: number
  label: string
}

/**
 * Per-stage overrides for the step detector, in metres and seconds.
 *
 * A stage that steps on every beat needs a much twitchier detector than one
 * that steps and holds: the burst has to close in the dip between two steps
 * rather than during a deliberate pause. Anything left out falls back to the
 * trainer's own Inspector values.
 */
export type DetectorSpec = {
  onsetSpeed?: number
  endSpeed?: number
  endHold?: number
  minDisplacement?: number
  /** Accepted travel per step, metres. */
  stepSizeMin?: number
  stepSizeMax?: number
}

/**
 * How a stage decides a step happened.
 *
 * `Burst` waits for a run of movement to start and settle, which is what a
 * step-and-hold dance produces. `Beat` instead samples travel between one count
 * and the next and asks whether it went the right way — the only thing that
 * works for a march, where nothing ever settles and four steps the same
 * direction would otherwise read as one long slide.
 */
export enum Grading {
  Burst,
  Beat
}

export type StageSpec = {
  name: string
  axis: Axis
  /** The translating steps of the 8-count, in order. */
  steps: StepSpec[]
  /** Shown on the panel once the stage's sets are done. */
  completeMessage: string
  grading?: Grading
  detector?: DetectorSpec
  /**
   * A set is the pattern followed by its mirror image, not the pattern alone.
   *
   * The side-to-side basic travels two steps one way and two back, which only
   * ever rehearses one side. Requiring the mirror as well makes a set the full
   * sixteen counts — left, left, right, right, then right, right, left, left —
   * so the dancer proves the step in both directions before the stage passes.
   */
  mirroredRepeat?: boolean
}

export type RoutineSpec = {
  /** Catalogue name of the dance this teaches. */
  dance: string
  stages: StageSpec[]
}

/**
 * Bachata: step, then hold. Only the odd counts travel — the even ones are the
 * close and the tap, which carry no displacement and so raise no step event.
 */
const BACHATA: RoutineSpec = {
  dance: "Bachata",
  stages: [
    {
      name: "Side to side",
      axis: Axis.Lateral,
      steps: [
        {direction: -1, count: 1, label: "LEFT"},
        {direction: -1, count: 3, label: "LEFT"},
        {direction: 1, count: 5, label: "RIGHT"},
        {direction: 1, count: 7, label: "RIGHT"}
      ],
      mirroredRepeat: true,
      // Wrapped by hand: at the current type size a single line of this length
      // runs past the panel edges.
      completeMessage: "Great! Next, you'll move\nforward and backward"
    },
    {
      name: "Forward and back",
      axis: Axis.Sagittal,
      steps: [
        {direction: 1, count: 1, label: "FORWARD"},
        {direction: 1, count: 3, label: "FORWARD"},
        {direction: -1, count: 5, label: "BACK"},
        {direction: -1, count: 7, label: "BACK"}
      ],
      completeMessage: "Congratulations!\nYou've got both basics."
    }
  ]
}

/**
 * Merengue: a march, with a weight change on every one of the eight counts and
 * no hold anywhere in the bar. Both stages are graded beat by beat — see
 * {@link Grading}.
 */
/**
 * In beat grading only the size window is consulted — the burst thresholds play
 * no part, because no burst is ever waited for. The floor is low because a
 * march step is small, and the ceiling is generous because four steps the same
 * way carry the dancer a fair distance before the turn.
 */
const MERENGUE_DETECTOR = {
  stepSizeMin: 0.05,
  stepSizeMax: 0.6
}

const MERENGUE: RoutineSpec = {
  dance: "Merengue",
  stages: [
    {
      name: "Marching side to side",
      axis: Axis.Lateral,
      steps: [
        {direction: -1, count: 1, label: "LEFT"},
        {direction: 1, count: 2, label: "RIGHT"},
        {direction: -1, count: 3, label: "LEFT"},
        {direction: 1, count: 4, label: "RIGHT"},
        {direction: -1, count: 5, label: "LEFT"},
        {direction: 1, count: 6, label: "RIGHT"},
        {direction: -1, count: 7, label: "LEFT"},
        {direction: 1, count: 8, label: "RIGHT"}
      ],
      completeMessage: "Great! Next, you'll march\nforward and back",
      grading: Grading.Beat,
      detector: MERENGUE_DETECTOR
    },
    {
      name: "Marching forward and back",
      axis: Axis.Sagittal,
      steps: [
        {direction: 1, count: 1, label: "FORWARD"},
        {direction: 1, count: 2, label: "FORWARD"},
        {direction: 1, count: 3, label: "FORWARD"},
        {direction: 1, count: 4, label: "FORWARD"},
        {direction: -1, count: 5, label: "BACK"},
        {direction: -1, count: 6, label: "BACK"},
        {direction: -1, count: 7, label: "BACK"},
        {direction: -1, count: 8, label: "BACK"}
      ],
      completeMessage: "Congratulations!\nYou've got the merengue march.",
      grading: Grading.Beat,
      detector: MERENGUE_DETECTOR
    }
  ]
}

export const ROUTINES: RoutineSpec[] = [BACHATA, MERENGUE]

/** The routine for a dance, falling back to Bachata's so the trainer always runs. */
export function routineFor(dance: string): RoutineSpec {
  return ROUTINES.find((r) => r.dance === dance) ?? BACHATA
}
