import { w as head, y as ensure_array_like, x as attr, F as bind_props } from "../../../../chunks/index.js";
import { l as escape_html } from "../../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    head("1n2426w", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(data.project.project.name)} • Pottery Pattern CAD</title>`);
      });
    });
    $$renderer2.push(`<main class="svelte-1n2426w"><a href="/" class="svelte-1n2426w">← Back</a> <h1>${escape_html(data.project.project.name)}</h1> <p>Created ${escape_html(new Date(data.project.project.createdAt).toLocaleString())} • Revisions ${escape_html(data.project.revisionsCount)} • Jobs ${escape_html(data.project.jobsCount)}</p> <section class="svelte-1n2426w"><h2>Recent Revisions</h2> `);
    if (data.revisions.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p>No revisions.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="svelte-1n2426w"><!--[-->`);
      const each_array = ensure_array_like(data.revisions.slice(0, 20));
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let rev = each_array[$$index];
        $$renderer2.push(`<li>${escape_html(rev.id.slice(0, 8))} • ${escape_html(new Date(rev.createdAt).toLocaleString())} • H${escape_html(rev.shapeDefinition.height)}/BW${escape_html(rev.shapeDefinition.bottomWidth)}/TW${escape_html(rev.shapeDefinition.topWidth)}</li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="svelte-1n2426w"><h2>Recent Jobs</h2> `);
    if (data.jobs.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p>No jobs.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="svelte-1n2426w"><!--[-->`);
      const each_array_1 = ensure_array_like(data.jobs.slice(0, 30));
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let job = each_array_1[$$index_1];
        $$renderer2.push(`<li class="svelte-1n2426w">${escape_html(job.jobId.slice(0, 8))} • ${escape_html(job.status)} • ${escape_html(new Date(job.createdAt).toLocaleString())} `);
        if (job.artifacts?.hasSvg) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a${attr("href", `/api/jobs/${job.jobId}/svg`)} target="_blank" rel="noreferrer" class="svelte-1n2426w">SVG</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.artifacts?.hasPdf) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a${attr("href", `/api/jobs/${job.jobId}/pdf`)} target="_blank" rel="noreferrer" class="svelte-1n2426w">PDF</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.artifacts?.hasStl) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a${attr("href", `/api/jobs/${job.jobId}/stl`)} target="_blank" rel="noreferrer" class="svelte-1n2426w">STL</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section></main>`);
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
