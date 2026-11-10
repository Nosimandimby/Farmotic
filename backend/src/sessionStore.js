import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, racineApplication } from './db.js';

const DUREE_MS = 7 * 24 * 60 * 60 * 1000;
export const NOM_COOKIE = 'farmotic.sid';

/** Petit store de sessions persistant sur SQLite (survit aux redémarrages). */
export class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`,
    );
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
    this.nettoyage = setInterval(() => {
      db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now());
    }, 60 * 60 * 1000);
    this.nettoyage.unref?.();
  }

  get(sid, callback) {
    try {
      const ligne = this.getStmt.get(sid);
      if (!ligne || ligne.expire < Date.now()) {
        return callback(null, null);
      }
      return callback(null, JSON.parse(ligne.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expire = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + DUREE_MS;
      this.setStmt.run(sid, JSON.stringify(sess), expire);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStmt.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback) {
    try {
      const expire = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + DUREE_MS;
      this.touchStmt.run(expire, sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }
}

/**
 * Secret de session stable, généré une fois puis conservé dans le dossier
 * `data/` : les sessions restent valides après un redémarrage.
 */
function secretSession() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

  const dossier = path.join(racineApplication, 'data');
  const fichier = path.join(dossier, 'session-secret.txt');
  try {
    if (fs.existsSync(fichier)) {
      const secret = fs.readFileSync(fichier, 'utf8').trim();
      if (secret) return secret;
    }
    fs.mkdirSync(dossier, { recursive: true });
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(fichier, secret, { mode: 0o600 });
    return secret;
  } catch {
    return crypto.randomBytes(48).toString('hex');
  }
}

export function createSessionOptions() {
  return {
    name: NOM_COOKIE,
    store: new SqliteSessionStore(),
    secret: secretSession(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: DUREE_MS,
    },
  };
}
