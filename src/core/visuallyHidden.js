/**
 * Creates a visually-hidden but screen-reader-visible element — the standard
 * "sr-only" CSS pattern (absolutely positioned, 1×1px, clipped, non-
 * scrolling) rather than `display:none`/`visibility:hidden`, either of which
 * would also hide it from assistive tech and defeat the entire point.
 * Extracted here once `chart/GraphChart.js`'s accessibility hidden div
 * (Prompt 180) needed the identical CSS `interact/KeyboardNav.js`'s ARIA
 * live region (Prompt 154) already had inline (CLAUDE.md §1.1 DRY two-strike
 * rule) — a `core/` leaf utility, the same "importable directly by any
 * layer" precedent as `core/GraphDisposal.js`/`core/Graph3DLoop.js`.
 * @param {string} [tagName]
 * @returns {HTMLElement}
 * @example const div = createVisuallyHiddenElement();
 */
export function createVisuallyHiddenElement(tagName = 'div') {
  const element = document.createElement(tagName);
  Object.assign(element.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  });
  return element;
}
