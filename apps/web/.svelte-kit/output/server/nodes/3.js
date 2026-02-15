import * as universal from '../entries/pages/projects/_projectId_/_page.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/projects/_projectId_/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/projects/[projectId]/+page.ts";
export const imports = ["_app/immutable/nodes/3.B6oytYHd.js","_app/immutable/chunks/BUApaBEI.js","_app/immutable/chunks/BiL_kXlK.js","_app/immutable/chunks/B0wh6175.js","_app/immutable/chunks/B96hWxR7.js","_app/immutable/chunks/Dpx-9nW5.js","_app/immutable/chunks/By0msZK5.js","_app/immutable/chunks/DHWLse8V.js","_app/immutable/chunks/Bq-p4Whc.js","_app/immutable/chunks/DomAaxTX.js"];
export const stylesheets = ["_app/immutable/assets/3.C-i3SSiF.css"];
export const fonts = [];
