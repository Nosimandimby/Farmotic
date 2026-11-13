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

/** Nom de fichier proposé par le serveur (ou daté localement). */
function nomSauvegarde(response) {
  const disposition = response.headers.get('content-disposition') || '';
  const correspondance = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (correspondance) {
    try {
      return decodeURIComponent(correspondance[1]);
    } catch {
      return correspondance[1];
    }
  }
  return `farmotic-database-${new Date().toISOString().slice(0, 10)}.sqlite`;
}

/** Télécharge une copie datée de la base et renvoie le nom du fichier. */
export async function telechargerSauvegarde() {
  if (estHorsLigne()) {
    throw new ErreurHorsLigne('Sauvegarde indisponible hors-ligne.');
  }

  const response = await fetch(`${BASE}/sauvegarde`, { credentials: 'include' });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'Téléchargement de la sauvegarde impossible.');
  }

  const nom = nomSauvegarde(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
  return nom;
}

/** Envoie un fichier .sqlite pour remplacer la base actuelle. */
export async function restaurerSauvegarde(fichier) {
  if (estHorsLigne()) {
    throw new ErreurHorsLigne('Restauration indisponible hors-ligne.');
  }

  const response = await fetch(`${BASE}/sauvegarde/restauration`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fichier,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.error || 'La restauration a échoué. Veuillez réessayer.',
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

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
