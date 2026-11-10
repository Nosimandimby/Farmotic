const BASE = '/api';

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (response.status === 401 && path !== '/login' && path !== '/me') {
    window.dispatchEvent(new Event('farmotic:unauthorized'));
  }

  if (!response.ok) {
    const message =
      data?.error || 'Une erreur est survenue. Veuillez réessayer.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body = {}) => request(path, { method: 'POST', body }),
  put: (path, body = {}) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  }
  const texte = search.toString();
  return texte ? `?${texte}` : '';
}
