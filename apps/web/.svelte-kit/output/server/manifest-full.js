export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.IrnRZ7fx.js",app:"_app/immutable/entry/app.sJakyzmG.js",imports:["_app/immutable/entry/start.IrnRZ7fx.js","_app/immutable/chunks/1jxP2rt7.js","_app/immutable/chunks/B0wh6175.js","_app/immutable/chunks/BUApaBEI.js","_app/immutable/chunks/DEf7JwQV.js","_app/immutable/entry/app.sJakyzmG.js","_app/immutable/chunks/B0wh6175.js","_app/immutable/chunks/Dpx-9nW5.js","_app/immutable/chunks/BiL_kXlK.js","_app/immutable/chunks/DEf7JwQV.js","_app/immutable/chunks/By0msZK5.js","_app/immutable/chunks/DHWLse8V.js","_app/immutable/chunks/DomAaxTX.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/jobs",
				pattern: /^\/api\/jobs\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]",
				pattern: /^\/api\/jobs\/([^/]+?)\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/cancel",
				pattern: /^\/api\/jobs\/([^/]+?)\/cancel\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/cancel/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/fork",
				pattern: /^\/api\/jobs\/([^/]+?)\/fork\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/fork/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/pdf",
				pattern: /^\/api\/jobs\/([^/]+?)\/pdf\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/pdf/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/retry",
				pattern: /^\/api\/jobs\/([^/]+?)\/retry\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/retry/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/stl",
				pattern: /^\/api\/jobs\/([^/]+?)\/stl\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/stl/_server.ts.js'))
			},
			{
				id: "/api/jobs/[jobId]/svg",
				pattern: /^\/api\/jobs\/([^/]+?)\/svg\/?$/,
				params: [{"name":"jobId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/jobs/_jobId_/svg/_server.ts.js'))
			},
			{
				id: "/api/projects",
				pattern: /^\/api\/projects\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/projects/_server.ts.js'))
			},
			{
				id: "/api/projects/[projectId]",
				pattern: /^\/api\/projects\/([^/]+?)\/?$/,
				params: [{"name":"projectId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/projects/_projectId_/_server.ts.js'))
			},
			{
				id: "/api/projects/[projectId]/revisions",
				pattern: /^\/api\/projects\/([^/]+?)\/revisions\/?$/,
				params: [{"name":"projectId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/projects/_projectId_/revisions/_server.ts.js'))
			},
			{
				id: "/projects/[projectId]",
				pattern: /^\/projects\/([^/]+?)\/?$/,
				params: [{"name":"projectId","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
