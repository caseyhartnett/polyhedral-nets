

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.BmVFJH3B.js","_app/immutable/chunks/BiL_kXlK.js","_app/immutable/chunks/B0wh6175.js","_app/immutable/chunks/DHWLse8V.js"];
export const stylesheets = [];
export const fonts = [];
