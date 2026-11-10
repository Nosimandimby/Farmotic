import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

const ROLES = ['admin', 'operateur', 'lecteur'];
const CHAMPS = 'SELECT id, username, role, actif, created_at FROM users';
const LOGIN_VALIDE = /^[a-zA-Z0-9._-]{3,40}$/;

// Toutes les routes de gestion des comptes sont réservées aux administrateurs.
router.use('/utilisateurs', requireAuth, requireRole('admin'));

function normaliser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'lecteur',
    actif: user.actif === null || user.actif === undefined ? 1 : Number(user.actif),
    created_at: user.created_at,
  };
}

function nombreAdminsActifs(excluId = null) {
  const sql = excluId
    ? "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1 AND id != ?"
    : "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1";
  return excluId ? db.prepare(sql).get(excluId).total : db.prepare(sql).get().total;
}

function lireCible(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

router.get('/utilisateurs', (req, res) => {
  const utilisateurs = db
    .prepare(
      `${CHAMPS}
       ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'operateur' THEN 1 ELSE 2 END,
                username COLLATE NOCASE ASC`,
    )
    .all();
  res.json(utilisateurs.map(normaliser));
});

router.post('/utilisateurs', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const motDePasse = String(req.body?.mot_de_passe ?? '');
  const role = String(req.body?.role ?? 'lecteur');
  const actif =
    req.body?.actif === false || Number(req.body?.actif) === 0 ? 0 : 1;

  if (!LOGIN_VALIDE.test(username)) {
    return res.status(400).json({
      error:
        'Le login doit contenir 3 à 40 caractères : lettres, chiffres, point, tiret ou « _ ».',
    });
  }
  if (motDePasse.length < 4) {
    return res
      .status(400)
      .json({ error: 'Le mot de passe doit contenir au moins 4 caractères.' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }

  const existe = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .get(username);
  if (existe) {
    return res
      .status(409)
      .json({ error: `Le login « ${username} » est déjà utilisé.` });
  }

  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, actif) VALUES (?, ?, ?, ?)',
    )
    .run(username, bcrypt.hashSync(motDePasse, 10), role, actif);

  return res
    .status(201)
    .json(normaliser(lireCible(info.lastInsertRowid)));
});

router.put('/utilisateurs/:id', (req, res) => {
  const cible = lireCible(req.params.id);
  if (!cible) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const username =
    req.body?.username !== undefined
      ? String(req.body.username).trim()
      : cible.username;
  const role =
    req.body?.role !== undefined ? String(req.body.role) : cible.role || 'lecteur';
  const actif =
    req.body?.actif !== undefined
      ? req.body.actif === false || Number(req.body.actif) === 0
        ? 0
        : 1
      : cible.actif
        ? 1
        : 0;
  const motDePasse =
    req.body?.mot_de_passe !== undefined ? String(req.body.mot_de_passe) : '';

  if (!LOGIN_VALIDE.test(username)) {
    return res.status(400).json({
      error:
        'Le login doit contenir 3 à 40 caractères : lettres, chiffres, point, tiret ou « _ ».',
    });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }
  if (motDePasse && motDePasse.length < 4) {
    return res
      .status(400)
      .json({ error: 'Le mot de passe doit contenir au moins 4 caractères.' });
  }

  const doublon = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
    .get(username, cible.id);
  if (doublon) {
    return res
      .status(409)
      .json({ error: `Le login « ${username} » est déjà utilisé.` });
  }

  const soiMeme = Number(req.session.userId) === cible.id;
  if (soiMeme && (role !== 'admin' || actif === 0)) {
    return res.status(400).json({
      error:
        "Vous ne pouvez pas retirer vos propres droits d'administrateur ni désactiver votre compte.",
    });
  }

  const etaitAdminActif = cible.role === 'admin' && Boolean(cible.actif);
  if (etaitAdminActif && (role !== 'admin' || actif === 0) && nombreAdminsActifs(cible.id) === 0) {
    return res
      .status(400)
      .json({ error: 'Au moins un administrateur actif doit rester en place.' });
  }

  db.prepare('UPDATE users SET username = ?, role = ?, actif = ? WHERE id = ?').run(
    username,
    role,
    actif,
    cible.id,
  );
  if (motDePasse) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(motDePasse, 10),
      cible.id,
    );
  }

  return res.json(normaliser(lireCible(cible.id)));
});

router.delete('/utilisateurs/:id', (req, res) => {
  const cible = lireCible(req.params.id);
  if (!cible) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  if (Number(req.session.userId) === cible.id) {
    return res
      .status(400)
      .json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }
  if (cible.role === 'admin' && cible.actif && nombreAdminsActifs(cible.id) === 0) {
    return res
      .status(400)
      .json({ error: 'Au moins un administrateur actif doit rester en place.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(cible.id);
  return res.json({ ok: true });
});

export default router;
