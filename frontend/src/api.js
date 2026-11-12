const BASE = '/api';

/** Erreur typée renvoyée lorsque l'application est hors-ligne. */
export class ErreurHorsLigne extends Error {
  constructor(message = 'Données non disponibles hors-ligne') {
    super(message);
    this.name = 'ErreurHorsLigne';
    this.offline = true;
  }
}

function estHorsLigne() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function request(path, { method = 'GET', body } = {}) {
  const lecture = method === 'GET';

  // Une écriture ne peut pas aboutir hors-ligne : on échoue immédiatement avec
  // un message clair plutôt que de laisser le navigateur expirer.
  if (!lecture && estHorsLigne()) {
    throw new ErreurHorsLigne(
      'Action indisponible hors-ligne — consultation uniquement.',
    );
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // Réseau coupé ou requête interrompue : les pages gardent les données déjà
    // affichées (issues du cache du service worker) et peuvent afficher ce
    // message.
    if (lecture && estHorsLigne()) {
      throw new ErreurHorsLigne();
    }
    const erreurReseau = new Error(
      estHorsLigne()
        ? 'Données non disponibles hors-ligne'
        : 'Serveur injoignable. Vérifiez votre connexion puis réessayez.',
    );
    erreurReseau.offline = estHorsLigne();
    erreurReseau.cause = error;
    throw erreurReseau;
  }

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
