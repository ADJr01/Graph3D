import { createVisuallyHiddenElement } from '../core/visuallyHidden.js';

/**
 * A one-line, auto-generated summary of `data` — what the hidden a11y div
 * (Prompt 180) shows when `setLongDescription()` was never called.
 * @param {Array} data
 * @param {(datum:*, index:number) => *} yAccessor
 * @returns {string}
 */
export function describeData(data, yAccessor) {
  if (data.length === 0) return 'No data.';
  const plural = data.length === 1 ? '' : 's';
  const values = [];
  for (let i = 0; i < data.length; i++) {
    const value = yAccessor(data[i], i);
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return `${data.length} data point${plural}.`;
  return `${data.length} data point${plural}, values ranging from ${Math.min(...values)} to ${Math.max(...values)}.`;
}

/**
 * Returns `existingElement` unchanged, or creates a visually-hidden `<div>`
 * and inserts it immediately after `container` in the DOM — the "hidden
 * adjacent div" `setAriaLabel()`/`setLongDescription()` write into (Prompt
 * 180). A `<canvas>` carries no readable content of its own; this is where
 * a screen reader actually finds the chart's label/description.
 * @param {HTMLElement|null} existingElement
 * @param {HTMLElement} [container]
 * @returns {HTMLElement}
 * @throws {TypeError} If there's no existing element and `container` isn't a DOM element.
 */
export function ensureA11yElement(existingElement, container) {
  if (existingElement) return existingElement;
  if (!container || typeof container.insertAdjacentElement !== 'function') {
    throw new TypeError(
      'GraphChart: options.container must be a DOM element — required on the first setAriaLabel()/setLongDescription() call.',
    );
  }
  const element = createVisuallyHiddenElement();
  container.insertAdjacentElement('afterend', element);
  return element;
}
