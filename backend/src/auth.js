export function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ error: 'Non authentifié' });
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    next();
  };
}

export function currentUser(req) {
  if (!req.session?.userId) return null;
  const { db } = req.app.locals;
  return (
    db
      .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(req.session.userId) || null
  );
}
