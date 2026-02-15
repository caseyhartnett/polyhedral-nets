

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.BqNg6LM2.js","_app/immutable/chunks/DUsptdjt.js","_app/immutable/chunks/BuWPfYOh.js","_app/immutable/chunks/CIfvLNBB.js"];
export const stylesheets = [];
export const fonts = [];
