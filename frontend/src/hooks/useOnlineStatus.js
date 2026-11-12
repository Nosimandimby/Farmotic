import { useEffect, useState } from 'react';

export const MESSAGE_INDISPONIBLE_HORS_LIGNE = 'Indisponible hors-ligne';

function etatReseau() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true;
  }
  return navigator.onLine;
}

/**
 * Suit l'état du réseau du navigateur (navigator.onLine + événements
 * online/offline). Sert à passer l'application en « consultation seule »
 * lorsque la connexion est perdue.
 */
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(etatReseau);

  useEffect(() => {
    const enLigne = () => setIsOnline(true);
    const horsLigne = () => setIsOnline(false);

    window.addEventListener('online', enLigne);
    window.addEventListener('offline', horsLigne);
    // L'état a pu changer entre le premier rendu et le montage.
    setIsOnline(etatReseau());

    return () => {
      window.removeEventListener('online', enLigne);
      window.removeEventListener('offline', horsLigne);
    };
  }, []);

  return isOnline;
}
