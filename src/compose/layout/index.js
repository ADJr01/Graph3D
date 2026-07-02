import { stack } from './stack.js';
import { grid } from './grid.js';
import { force } from './force/index.js';
import { pack } from './pack.js';
import { tree } from './tree.js';

/**
 * The `layout` namespace (CLAUDE.md §5) — pure data-in, positioned-data-out
 * functions (no Three.js, per CLAUDE.md §1.4 SoC). `stack` (Prompt 70) turns
 * per-key datum values into stacked `[y0, y1]` series, d3-shape-parity.
 * `grid` (Prompt 71) centers `rows * cols` cells on the origin for
 * small-multiples positioning. `force` (Prompt 72) is a 3D force-directed
 * simulation (velocity Verlet + Barnes-Hut octree charge); its `.link`,
 * `.charge`, `.center`, `.collide`, `.radial` static properties are the
 * individual force factories `simulation.force(name, ...)` registers. `pack`
 * and `tree` (Prompt 73) are d3-hierarchy-parity layouts: `pack` nests
 * value-sized spheres inside their parent, `tree` fans a hierarchy radially
 * by depth.
 */
export const layout = { stack, grid, force, pack, tree };
