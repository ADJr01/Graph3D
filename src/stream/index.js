import { decimate } from './decimate.js';

export { DataStream } from './DataStream.js';
export { Aggregator } from './Aggregator.js';
export { LOD } from './LOD.js';
export { OriginShift } from './OriginShift.js';
export { GPGPU } from './GPGPU.js';
export { JoinDiff } from './JoinDiff.js';
export { memoryPressure } from './memoryPressure.js';

/**
 * The `middleware` namespace (mirrors `compose/transform`'s `transform`,
 * CLAUDE.md §1.1 DRY: same "factory takes config, returns a callable"
 * shape) — worker-hosted, **async** data transforms. Currently just
 * `decimate` (Prompt 162); more may join it as later `stream/` prompts land.
 */
export const middleware = { decimate };
