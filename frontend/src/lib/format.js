export function formatNombre(valeur, decimales = 2) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '—';
  return nombre.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  });
}

export function formatMontant(valeur, settings, decimales = 0) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '—';
  const symbole = settings?.symbole_devise ?? 'Ar';
  return `${formatNombre(nombre, decimales)} ${symbole}`;
}

export function formatPourcentage(valeur, decimales = 1) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '—';
  return `${formatNombre(nombre, decimales)} %`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateLongue(iso) {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function aujourdhuiISO() {
  return new Date().toLocaleDateString('en-CA');
}

export function jourAffiche(jour) {
  return jour === 1 ? 'Jour 1' : `Jour ${jour}`;
}
