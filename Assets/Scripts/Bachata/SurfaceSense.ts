/**
 * What the headset knows about the room, behind one interface.
 *
 * Three different systems can answer "is there floor here", and which ones
 * exist depends on the device. Rather than let the placement screen branch on
 * capabilities, everything is funnelled through here and reported as a verdict
 * the UI can act on.
 *
 * In order of preference:
 *
 *  - **Planes.** Native plane tracking, restricted to horizontal. Walls are
 *    never detected in the first place, so rejecting them stops being logic
 *    anyone has to maintain, and each plane reports its own size — which
 *    answers "is there enough room" without probing for it.
 *  - **Meshes.** Scene reconstruction with classification. This is the only
 *    source that knows a couch is a couch, and so the only one that can tell
 *    clear floor from a rug-height obstruction.
 *  - **Raycast.** World query hit tests. No semantics at all, but it works
 *    almost everywhere and is the floor under the other two.
 *
 * None of it runs in the editor: planes, meshes and hit tests are all device
 * only. {@link source} reports `None` there, and the caller is expected to fall
 * back to something it can show.
 */

/** Which system is answering. */
export enum SurfaceSource {
  None,
  Raycast,
  Planes
}

/** Whether a spot will do to dance on, and if not, what to tell the dancer. */
export enum FloorVerdict {
  /** Nothing can judge this spot — treat as permissive. */
  Unknown,
  Good,
  /** A wall, a ceiling, or something else nobody stands on. */
  NotFloor,
  /** Floor, but not a wide enough patch of it. */
  TooSmall,
  /** Floor with furniture in the way. */
  Obstructed
}

/**
 * Indices into {@link TrackedMeshHistogramResult.histogram}, whose order is
 * fixed by the API rather than by us.
 */
const enum Face {
  None = 0,
  Wall = 1,
  Floor = 2,
  Ceiling = 3,
  Table = 4,
  Seat = 5,
  Window = 6,
  Door = 7
}

export class SurfaceSense {
  private planes: TrackedPlane[] = []
  private hitSession: HitTestSession | null = null
  private classified: boolean = false
  private started: boolean = false
  private sourceKind: SurfaceSource = SurfaceSource.None

  /** Which system ended up answering. Read after {@link start}. */
  public get source(): SurfaceSource {
    return this.sourceKind
  }

  /** Whether verdicts can distinguish furniture from floor. */
  public get understandsFurniture(): boolean {
    return this.classified
  }

  constructor(
    private readonly owner: BaseScriptComponent,
    private readonly tracking: DeviceTracking | null,
    private readonly worldQuery: WorldQueryModule | null
  ) {}

  /**
   * Turn on whatever this device supports.
   *
   * Wrapped in a catch because the capability flags describe the hardware, not
   * the runtime: in the editor these globals may not resolve at all, and a
   * throw here would take the whole placement screen down with it. Losing
   * surface detection should cost the dancer a smarter reticle, not the lens.
   */
  public start(): void {
    if (this.started) {
      return
    }
    this.started = true

    try {
      this.startTracking()
    } catch (e) {
      this.planes = []
      this.classified = false
      this.sourceKind = SurfaceSource.None
    }

    // Hit testing is kept alongside the others rather than instead of them:
    // planes are coarse and take a moment to appear, so a raycast still gives
    // the plate something to sit on in the meantime.
    if (this.worldQuery) {
      this.hitSession = this.worldQuery.createHitTestSession()
      this.hitSession.start()
      if (this.sourceKind === SurfaceSource.None) {
        this.sourceKind = SurfaceSource.Raycast
      }
    }
  }

  private startTracking(): void {
    if (!this.tracking) {
      return
    }
    const capabilities = this.tracking.worldTrackingCapabilities

    if (capabilities && capabilities.planesTrackingSupported) {
      // Horizontal only. A dance floor on a wall is not a thing, and filtering
      // at the source is stricter than any normal-angle test written here.
      this.tracking.worldOptions.nativePlaneTrackingType = NativePlaneTrackingType.Horizontal
      this.bindPlaneEvents()
      this.sourceKind = SurfaceSource.Planes
    }

    if (capabilities && capabilities.sceneReconstructionSupported) {
      this.tracking.worldOptions.enableWorldMeshesTracking = true
      this.tracking.worldOptions.enableWorldMeshesClassificationTracking = true
      this.classified = true
    }
  }

  private bindPlaneEvents(): void {
    this.owner.createEvent("WorldTrackingPlanesAddedEvent").bind((event: WorldTrackingPlanesAddedEvent) => {
      const added = event.getPlanes()
      for (let i = 0; i < added.length; i++) {
        this.planes.push(added[i])
      }
    })

    // Planes merge and grow as the room is explored, arriving as a removal and
    // an addition rather than an edit, so both lists have to be kept in step.
    this.owner.createEvent("WorldTrackingPlanesRemovedEvent").bind((event: WorldTrackingPlanesRemovedEvent) => {
      const gone = event.getPlanes()
      this.planes = this.planes.filter((plane) => gone.indexOf(plane) < 0)
    })

    this.owner.createEvent("WorldTrackingResetEvent").bind(() => {
      this.planes = []
    })
  }

  /**
   * Where the dancer's gaze meets the floor, or null if it meets nothing.
   *
   * Planes are consulted first because they give a stable answer: a plane holds
   * its height even as the head moves, where consecutive hit tests jitter by a
   * centimetre or two and take the plate with them.
   */
  public floorUnderGaze(head: vec3, gaze: vec3, reach: number): vec3 | null {
    const onPlane = this.gazeAgainstPlanes(head, gaze, reach)
    if (onPlane) {
      return onPlane
    }
    return null
  }

  /** Fire a hit test for the frame after next; results arrive by callback. */
  public probe(from: vec3, to: vec3, onHit: (hit: WorldQueryHitTestResult) => void): void {
    if (!this.hitSession) {
      return
    }
    this.hitSession.hitTest(from, to, (hit: WorldQueryHitTestResult) => {
      if (hit) {
        onHit(hit)
      }
    })
  }

  private gazeAgainstPlanes(head: vec3, gaze: vec3, reach: number): vec3 | null {
    let best: vec3 | null = null
    let nearest = reach

    for (let i = 0; i < this.planes.length; i++) {
      const plane = this.planes[i]
      if (!plane.isValid || plane.orientation !== TrackedPlaneOrientation.Horizontal) {
        continue
      }

      const normal = plane.transform.multiplyDirection(vec3.up()).normalize()
      const facing = gaze.dot(normal)
      // Near-zero means the gaze is skimming along the plane rather than
      // crossing it, which has no useful intersection however the arithmetic
      // works out.
      if (Math.abs(facing) < 1e-4) {
        continue
      }

      const distance = plane.pivot.sub(head).dot(normal) / facing
      if (distance <= 0 || distance >= nearest) {
        continue
      }

      const point = head.add(gaze.uniformScale(distance))
      if (!this.withinPlane(plane, point)) {
        continue
      }
      nearest = distance
      best = point
    }
    return best
  }

  /** Is `point` inside the plane's own rectangle, rather than its infinite extension? */
  private withinPlane(plane: TrackedPlane, point: vec3): boolean {
    const local = plane.transform.inverse().multiplyPoint(point)
    const size = plane.size
    return Math.abs(local.x) <= size.x * 0.5 && Math.abs(local.z) <= size.z * 0.5
  }

  /**
   * Judge a square of floor centred on `centre`.
   *
   * Classification is asked first and believed when it answers. It is the only
   * source that separates "clear floor" from "floor with a coffee table on
   * it", which is the distinction that actually matters to someone about to
   * step sideways with their eyes on a screen.
   */
  public judge(centre: vec3, radius: number, minFloorFraction: number): FloorVerdict {
    const byMesh = this.judgeByMesh(centre, radius, minFloorFraction)
    if (byMesh !== FloorVerdict.Unknown) {
      return byMesh
    }
    return this.judgeByPlane(centre, radius)
  }

  private judgeByMesh(centre: vec3, radius: number, minFloorFraction: number): FloorVerdict {
    if (!this.classified || !this.tracking) {
      return FloorVerdict.Unknown
    }

    const result = this.tracking.calculateWorldMeshHistogram(centre, radius)
    if (!result || !result.histogram || result.histogram.length <= Face.Door) {
      return FloorVerdict.Unknown
    }
    const bins = result.histogram

    // An empty histogram means the room has not been reconstructed here yet,
    // which is not the same as a bad spot — say nothing rather than refuse.
    let total = 0
    for (let i = 0; i < bins.length; i++) {
      total += bins[i]
    }
    if (total <= 1e-3) {
      return FloorVerdict.Unknown
    }

    if (bins[Face.Floor] >= minFloorFraction) {
      return FloorVerdict.Good
    }
    // What is taking up the rest decides the wording. Walls and ceilings mean
    // the dancer is aiming at the wrong kind of surface entirely; furniture
    // means the right surface with something on it, and moving a metre over
    // will fix it.
    if (bins[Face.Wall] + bins[Face.Ceiling] + bins[Face.Window] + bins[Face.Door] > bins[Face.Floor]) {
      return FloorVerdict.NotFloor
    }
    return FloorVerdict.Obstructed
  }

  private judgeByPlane(centre: vec3, radius: number): FloorVerdict {
    if (this.sourceKind !== SurfaceSource.Planes || this.planes.length === 0) {
      return FloorVerdict.Unknown
    }

    for (let i = 0; i < this.planes.length; i++) {
      const plane = this.planes[i]
      if (!plane.isValid || plane.orientation !== TrackedPlaneOrientation.Horizontal) {
        continue
      }
      if (!this.withinPlane(plane, centre)) {
        continue
      }
      // The plane reports its own extent, so "will the floor fit" is a
      // comparison rather than a search.
      const wide = plane.size.x >= radius * 2 && plane.size.z >= radius * 2
      return wide ? FloorVerdict.Good : FloorVerdict.TooSmall
    }
    return FloorVerdict.Unknown
  }

  public stop(): void {
    if (this.hitSession) {
      this.hitSession.stop()
      this.hitSession = null
    }
  }
}
