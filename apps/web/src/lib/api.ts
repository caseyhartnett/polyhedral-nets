const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

export function toApiUrl(pathname: string): string {
  return `${API_BASE_URL}${pathname}`;
}
