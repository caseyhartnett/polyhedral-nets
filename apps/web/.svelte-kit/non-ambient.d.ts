
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/jobs" | "/api/jobs/[jobId]" | "/api/jobs/[jobId]/cancel" | "/api/jobs/[jobId]/fork" | "/api/jobs/[jobId]/pdf" | "/api/jobs/[jobId]/retry" | "/api/jobs/[jobId]/stl" | "/api/jobs/[jobId]/svg" | "/api/projects" | "/api/projects/[projectId]" | "/api/projects/[projectId]/revisions" | "/projects" | "/projects/[projectId]";
		RouteParams(): {
			"/api/jobs/[jobId]": { jobId: string };
			"/api/jobs/[jobId]/cancel": { jobId: string };
			"/api/jobs/[jobId]/fork": { jobId: string };
			"/api/jobs/[jobId]/pdf": { jobId: string };
			"/api/jobs/[jobId]/retry": { jobId: string };
			"/api/jobs/[jobId]/stl": { jobId: string };
			"/api/jobs/[jobId]/svg": { jobId: string };
			"/api/projects/[projectId]": { projectId: string };
			"/api/projects/[projectId]/revisions": { projectId: string };
			"/projects/[projectId]": { projectId: string }
		};
		LayoutParams(): {
			"/": { jobId?: string; projectId?: string };
			"/api": { jobId?: string; projectId?: string };
			"/api/jobs": { jobId?: string };
			"/api/jobs/[jobId]": { jobId: string };
			"/api/jobs/[jobId]/cancel": { jobId: string };
			"/api/jobs/[jobId]/fork": { jobId: string };
			"/api/jobs/[jobId]/pdf": { jobId: string };
			"/api/jobs/[jobId]/retry": { jobId: string };
			"/api/jobs/[jobId]/stl": { jobId: string };
			"/api/jobs/[jobId]/svg": { jobId: string };
			"/api/projects": { projectId?: string };
			"/api/projects/[projectId]": { projectId: string };
			"/api/projects/[projectId]/revisions": { projectId: string };
			"/projects": { projectId?: string };
			"/projects/[projectId]": { projectId: string }
		};
		Pathname(): "/" | "/api" | "/api/" | "/api/jobs" | "/api/jobs/" | `/api/jobs/${string}` & {} | `/api/jobs/${string}/` & {} | `/api/jobs/${string}/cancel` & {} | `/api/jobs/${string}/cancel/` & {} | `/api/jobs/${string}/fork` & {} | `/api/jobs/${string}/fork/` & {} | `/api/jobs/${string}/pdf` & {} | `/api/jobs/${string}/pdf/` & {} | `/api/jobs/${string}/retry` & {} | `/api/jobs/${string}/retry/` & {} | `/api/jobs/${string}/stl` & {} | `/api/jobs/${string}/stl/` & {} | `/api/jobs/${string}/svg` & {} | `/api/jobs/${string}/svg/` & {} | "/api/projects" | "/api/projects/" | `/api/projects/${string}` & {} | `/api/projects/${string}/` & {} | `/api/projects/${string}/revisions` & {} | `/api/projects/${string}/revisions/` & {} | "/projects" | "/projects/" | `/projects/${string}` & {} | `/projects/${string}/` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}