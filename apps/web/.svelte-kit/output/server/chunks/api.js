const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
function toApiUrl(pathname) {
  return `${API_BASE_URL}${pathname}`;
}
export {
  toApiUrl as t
};
