import * as universal from '../entries/pages/projects/_projectId_/_page.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/projects/_projectId_/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/projects/[projectId]/+page.ts";
export const imports = ["_app/immutable/nodes/3.B98bNHAL.js","_app/immutable/chunks/BUApaBEI.js","_app/immutable/chunks/DUsptdjt.js","_app/immutable/chunks/BuWPfYOh.js","_app/immutable/chunks/BZEA7tm-.js","_app/immutable/chunks/DXb-FEHi.js","_app/immutable/chunks/DhAqJI-G.js","_app/immutable/chunks/CIfvLNBB.js","_app/immutable/chunks/BPDz6Smv.js","_app/immutable/chunks/BKZoytxh.js"];
export const stylesheets = ["_app/immutable/assets/3.h6Ep-ngg.css"];
export const fonts = [];
