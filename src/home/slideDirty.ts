/** Ask the glass to re-bake the slide that contains `el` (e.g. after something moved in it). */
export function markSlideDirty(el: Element | null) {
  el?.dispatchEvent(new Event('slide-dirty', { bubbles: true }))
}
