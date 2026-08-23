/**
 * Stops a panel's contents from flickering, popping out of view, or letting the
 * room show through.
 *
 * Two separate faults, both from the same place — UIKit sizes its plates by
 * writing into the material rather than by scaling the object:
 *
 * 1. **Wrong cull bounds.** A row drawn 21 cm wide is still a unit quad as far
 *    as the engine's bounding box is concerned, so it gets frustum-culled while
 *    plainly on screen. That is the element that vanishes at one camera angle
 *    and comes back at another, and the flicker while a list scrolls. Padding
 *    the box out fixes it; these are a handful of quads, so the culling was
 *    never worth much here anyway.
 *
 * 2. **Coplanar sorting.** The frame plate, its buttons and their labels are
 *    transparent and sit within a couple of millimetres of each other, so the
 *    draw order falls back to camera distance and flips as the viewer moves —
 *    which is what lets the background show through. Ordering by depth in the
 *    hierarchy makes it explicit and stable: a child always draws over its
 *    parent, so labels beat buttons and buttons beat the frame.
 */
@component
export class PanelRendering extends BaseScriptComponent {
  @input
  @hint("Render order given to this object's own visuals. Children count upward from here.")
  private baseOrder: number = 0

  @input
  @hint(
    "How far to inflate each visual's culling box, as a multiple of its size. \
Raise it if parts of the panel still blink out at the edge of view."
  )
  private cullPad: number = 10

  private applied: boolean = false

  onAwake(): void {
    // Panels start switched off, so OnStart alone would never run — the same
    // guarded double-bind every other script on these panels uses.
    this.createEvent("OnStartEvent").bind(() => this.run())
    this.createEvent("OnEnableEvent").bind(() => this.run())
  }

  private run(): void {
    if (this.applied) {
      return
    }
    this.applied = true
    PanelRendering.apply(this.sceneObject, this.baseOrder, this.cullPad)

    // Again once the frame and its controls have built their visuals. UIKit
    // builds those in its own start-up, which can land after this one, and a
    // control that was not ready keeps whatever order it had — for the frame
    // plate that is zero, which ties it with the world behind the panel.
    const settle = this.createEvent("DelayedCallbackEvent")
    settle.bind(() => PanelRendering.apply(this.sceneObject, this.baseOrder, this.cullPad))
    settle.reset(0)
  }

  /**
   * Walk a subtree, ordering and un-culling every visual in it.
   *
   * Exposed statically so content built at run time — the dance rows — can be
   * given the same treatment the moment it is created, which is after this
   * component has already run.
   */
  public static apply(root: SceneObject, baseOrder: number, cullPad: number, depth: number = 0): void {
    if (!root) {
      return
    }
    // Two slots per level: geometry, then the text sitting on top of it.
    const order = baseOrder + depth * 2

    // Queried as two separate types rather than as Visual and sorted out with
    // `instanceof`: the ambient class names are compile-time only and are not
    // bound at run time, so testing against them throws.
    for (const mesh of root.getComponents("Component.MaterialMeshVisual") as MaterialMeshVisual[]) {
      mesh.renderOrder = order
      PanelRendering.unCull(mesh, cullPad)
    }

    // UIKit controls own their mesh and re-apply their own render order when
    // they initialize, which happens after this runs and would wipe the value
    // just written above. Setting it on the control instead is what sticks —
    // it is the number the control re-applies. Detected by duck-typing rather
    // than by importing Button, Slider, Switch and Frame one by one, so a
    // control added later is covered without touching this.
    for (const script of root.getComponents("Component.ScriptComponent") as unknown[]) {
      const element = script as {renderOrder?: number}
      try {
        element.renderOrder = order
      } catch (e) {
        // Not a control that carries a render order, or one whose visual is not
        // built yet — Frame reaches straight through to its visual and throws if
        // it is asked too early. The deferred second pass catches those.
      }
    }
    // Text is nudged one above its own level's geometry so a label never loses
    // to the plate it is written on.
    for (const text of root.getComponents("Component.Text") as Text[]) {
      text.renderOrder = order + 1
    }

    for (let i = 0; i < root.getChildrenCount(); i++) {
      PanelRendering.apply(root.getChild(i), baseOrder, cullPad, depth + 1)
    }
  }

  /**
   * Widen a visual's culling box so it is not dropped while still on screen.
   *
   * Only mesh visuals carry a material to set this on; Text computes its bounds
   * from its own glyphs, which are correct already, so it needs nothing.
   */
  private static unCull(mesh: MaterialMeshVisual, cullPad: number): void {
    if (!mesh.materials) {
      return
    }
    for (const material of mesh.materials) {
      const pass = material.mainPass
      if (!pass) {
        continue
      }
      pass.frustumCullMode = FrustumCullMode.Extend
      pass.frustumCullPad = cullPad
    }
  }
}
