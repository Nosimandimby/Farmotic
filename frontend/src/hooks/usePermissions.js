import { useAuth } from '../context/AuthContext.jsx';

/** Message affiché sur les actions désactivées d'un compte en lecture seule. */
export const MESSAGE_LECTURE_SEULE =
  'Votre compte est en lecture seule : modification impossible.';

/**
 * Indique si l'utilisateur connecté peut créer, modifier ou supprimer des
 * données. Les rôles « admin » et « operateur » le peuvent ; « lecteur » est
 * limité à la consultation.
 */
export default function usePeutModifier() {
  const { user } = useAuth();
  return user?.role === 'admin' || user?.role === 'operateur';
}
