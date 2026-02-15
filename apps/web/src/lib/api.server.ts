export function toApiUrl(pathname: string): string {
  const base = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
}
