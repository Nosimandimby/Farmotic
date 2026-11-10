import express from 'express';
import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { db, initDb, dbPath } from './db.js';
import { dossierInterface } from './chemins.js';
import { requireAuth } from './auth.js';
import { createSessionOptions, NOM_COOKIE } from './sessionStore.js';
import authRoutes from './routes/auth.js';
import cyclesRoutes from './routes/cycles.js';
import dashboardRoutes from './routes/dashboard.js';
import parametresRoutes from './routes/parametres.js';
import referencesRoutes from './routes/references.js';
import relevesRoutes from './routes/releves.js';
import mortalitesRoutes from './routes/mortalites.js';
import chargesRoutes from './routes/charges.js';
import ventesRoutes from './routes/ventes.js';
import settingsRoutes from './routes/settings.js';
import utilisateursRoutes from './routes/utilisateurs.js';

const args = process.argv.slice(2);
const PORT_DEMANDE = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const OUVRIR_NAVIGATEUR =
  !args.includes('--no-open') && process.env.FARMOTIC_NO_OPEN !== '1';

initDb();

const app = express();
app.locals.db = db;
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
});

app.use(session(createSessionOptions()));

app.get('/api/sante', (req, res) => res.json({ ok: true }));

// Authentification (login/logout publics, /me et /password protégés)
app.use('/api', authRoutes);

// Toutes les autres routes API exigent une session valide (sauf /login et /logout)
app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next();
  requireAuth(req, res, next);
});

app.use('/api', dashboardRoutes);
app.use('/api', cyclesRoutes);
app.use('/api', parametresRoutes);
app.use('/api', referencesRoutes);
app.use('/api', relevesRoutes);
app.use('/api', mortalitesRoutes);
app.use('/api', chargesRoutes);
app.use('/api', ventesRoutes);
app.use('/api', settingsRoutes);
app.use('/api', utilisateursRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ressource introuvable.' });
});

// Sert l'interface compilée (frontend/dist ou build/public)
const dist = dossierInterface();
if (dist) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  console.warn(
    "\n  ⚠ Interface non compilée : lancez « npm run build » (ou utilisez ./start.sh).\n",
  );
  app.get('/', (req, res) =>
    res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send("L'interface n'est pas compilée. Lancez « npm run build » puis redémarrez."),
  );
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

function ouvrirDansNavigateur(url) {
  const commandes = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
  };
  const commande = commandes[process.platform];
  if (!commande) return;
  try {
    const enfant = spawn(commande[0], commande[1], {
      detached: true,
      stdio: 'ignore',
    });
    enfant.on('error', () => {});
    enfant.unref();
  } catch {
    /* l'ouverture du navigateur n'est pas indispensable */
  }
}

let serveur = null;

function demarrer(port, tentative = 0) {
  serveur = app.listen(port, HOST, () => {
    const hoteAffiche = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    const url = `http://${hoteAffiche}:${port}`;
    console.log('');
    console.log('  🐔 Farmotic — suivi des poulets de chair');
    console.log(`  Interface et API : ${url}`);
    console.log(`  Base de données  : ${dbPath}`);
    if (HOST === '0.0.0.0') {
      console.log('  Accès réseau     : ce PC ou un autre appareil du réseau local');
    }
    console.log('  Arrêt            : Ctrl+C');
    console.log('');
    if (OUVRIR_NAVIGATEUR) ouvrirDansNavigateur(url);
  });

  serveur.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && tentative < 10) {
      const suivant = port + 1;
      console.log(`  Port ${port} occupé, essai sur le port ${suivant}…`);
      demarrer(suivant, tentative + 1);
      return;
    }
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n  Le port ${port} est déjà utilisé. Fermez l'application déjà lancée,\n  ou démarrez avec un autre port : PORT=3100 ./start.sh\n`,
      );
    } else {
      console.error('\n  Impossible de démarrer le serveur :', error.message, '\n');
    }
    process.exit(1);
  });
}

demarrer(PORT_DEMANDE);

function arreter(signal) {
  console.log(`\n  Arrêt de Farmotic (${signal})…`);
  try {
    serveur?.close();
  } catch {
    /* déjà arrêté */
  }
  try {
    db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now());
    db.close();
  } catch {
    /* base déjà fermée */
  }
  process.exit(0);
}

process.on('SIGINT', () => arreter('SIGINT'));
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('Erreur inattendue :', error);
});
process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée :', error);
});

export { app, NOM_COOKIE };
