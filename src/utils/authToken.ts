export const AUTH_TOKEN_KEY = 'platinum_list_token';

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Clear a stale/invalid token and send the user back to the PIN screen. */
export function handleUnauthorized(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.reload();
}
