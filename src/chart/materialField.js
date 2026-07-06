import { material } from '../material/index.js';

/**
 * Resolves a chart's `.material()` config (`{presetName, options}|null`, as
 * returned by `GraphChart.material()`'s own no-arg getter) to an actual
 * `THREE.Material` — `material[presetName](options)` if configured,
 * `material.standard()` otherwise.
 *
 * Extracted out of `GraphChart` (Prompt 129, its own private version) once
 * `AreaChart`/`SurfaceChart` (Prompt 135) needed the identical resolution
 * but couldn't reach a private method on a sibling subclass (CLAUDE.md
 * §1.1 DRY two-strike rule).
 * @param {{presetName: string, options: object}|null} materialConfig
 * @returns {import('three').Material}
 */
export function resolveChartMaterial(materialConfig) {
  return materialConfig ? material[materialConfig.presetName](materialConfig.options) : material.standard();
}
