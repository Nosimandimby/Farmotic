import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: 'Veuillez renseigner le login et le mot de passe.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Login ou mot de passe incorrect.' });
  }

  if (Number(user.actif) === 0) {
    return res
      .status(403)
      .json({ error: 'Ce compte est désactivé. Contactez un administrateur.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role || 'lecteur',
      actif: Number(user.actif ?? 1),
      created_at: user.created_at,
    },
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('farmotic.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, role, actif, created_at FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });
  if (Number(user.actif) === 0) {
    req.session?.destroy?.(() => {});
    return res.status(401).json({ error: 'Ce compte est désactivé.' });
  }
  return res.json({
    user: { ...user, role: user.role || 'lecteur', actif: Number(user.actif ?? 1) },
  });
});

router.put('/password', requireAuth, (req, res) => {
  const actuel = String(req.body?.mot_de_passe_actuel || '');
  const nouveau = String(req.body?.nouveau_mot_de_passe || '');

  if (nouveau.length < 4) {
    return res
      .status(400)
      .json({ error: 'Le nouveau mot de passe doit contenir au moins 4 caractères.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user || !bcrypt.compareSync(actuel, user.password_hash)) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }

  const hash = bcrypt.hashSync(nouveau, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  return res.json({ ok: true });
});

export default router;
