

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.BZI9vxor.js","_app/immutable/chunks/CUi9kwaE.js","_app/immutable/chunks/BPAtTmwV.js","_app/immutable/chunks/CmQNTbo6.js"];
export const stylesheets = [];
export const fonts = [];
