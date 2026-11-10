# Farmotic 🐔

Application de suivi d'élevage de poulets de chair : cycles (bandes), relevés
journaliers, mortalité, charges, références de croissance et indicateurs
technico-économiques (indice de consommation, coût par kilo, marge).

Interface React (Vite + Tailwind) et API Node.js/Express, avec une base SQLite
locale. Tout fonctionne hors ligne, sur un seul PC.

## Prérequis

- **Node.js 20 ou plus récent** (https://nodejs.org/). Le dossier `.tools/node`
  fourni peut aussi être utilisé automatiquement sous Linux/macOS.

## Démarrage rapide

| Système | Commande |
| --- | --- |
| Linux / macOS | `./start.sh` |
| Windows | double-clic sur `Demarrer-Farmotic.bat` |

Le script installe les dépendances au premier lancement, compile l'application
si nécessaire (`build/`), démarre le serveur puis ouvre le navigateur sur
http://127.0.0.1:3001.

**Compte par défaut :** login `admin`, mot de passe `admin`.
Pensez à le changer dans *Paramètres → Mon compte*.

## Raspberry Pi (arm64) et autres machines

Farmotic tourne aussi sur un Raspberry Pi : la base SQLite est embarquée en
WebAssembly (`node-sqlite3-wasm`) et le mot de passe utilise `bcryptjs`, tous
deux indépendants du processeur. Aucune compilation native n'est nécessaire.

**Le binaire Node.js de `.tools/node` est compilé pour x86-64** : il ne peut pas
s'exécuter sur un Pi. `start.sh` et `dev.sh` le détectent et basculent
automatiquement sur le Node.js du système.

### Installation sur Raspberry Pi OS 64 bits

```bash
sudo apt update
sudo apt install -y nodejs npm        # Node 18+ (NodeSource pour une 20 LTS)
node -v                               # doit afficher v18 ou plus
cd ~/Farmotic
./start.sh
```

Le premier lancement installe les dépendances (connexion Internet requise une
seule fois) puis compile l'application. Sur un Pi, la compilation peut prendre
plusieurs minutes et demande de la mémoire ; si elle échoue par manque de RAM,
ajoutez du swap (`sudo dphys-swapfile setup`) ou compilez `build/` sur un PC
avant de le copier : ce dossier est indépendant de l'architecture et se lance
avec `node build/farmotic.cjs`.

### Accès depuis un téléphone ou un autre poste

Par défaut l'application n'écoute que sur la machine locale. Pour l'ouvrir
depuis un autre appareil du réseau (utile dans un élevage) :

```bash
HOST=0.0.0.0 ./start.sh
# puis, depuis le téléphone : http://<adresse-ip-du-pi>:3001
```

### Démarrage automatique au boot (systemd)

```ini
# /etc/systemd/system/farmotic.service
[Unit]
Description=Farmotic (suivi d'élevage de poulets de chair)
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Farmotic
Environment=HOST=0.0.0.0
Environment=PORT=3001
Environment=FARMOTIC_NO_OPEN=1
ExecStart=/usr/bin/env bash /home/pi/Farmotic/start.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now farmotic
sudo systemctl status farmotic
```

Sur un Pi sans écran, laissez `FARMOTIC_NO_OPEN=1` : le serveur démarre sans
tenter d'ouvrir un navigateur.

## Options utiles

```bash
PORT=3100 ./start.sh          # imposer le port (sinon 3001, ou le suivant s'il est occupé)
HOST=0.0.0.0 ./start.sh       # rendre l'application accessible aux autres appareils du réseau
FARMOTIC_NO_OPEN=1 ./start.sh # ne pas ouvrir le navigateur
```

Sous Windows, ces variables s'utilisent dans l'invite de commandes :

```bat
set PORT=3100
Demarrer-Farmotic.bat
```

## Mode développement

```bash
./dev.sh        # ou : npm run dev
```

- Interface : http://localhost:5173 (rechargement à chaud)
- API : http://localhost:3001 (proxy `/api` configuré dans Vite)

## Compilation manuelle

```bash
npm install        # dépendances
npm run build      # interface -> build/public, serveur -> build/farmotic.cjs
npm start          # équivalent à : node build/farmotic.cjs
```

`npm run serve` démarre directement les sources (`backend/src/server.js`) sans
compilation, à condition que l'interface soit déjà compilée.

## Données et sauvegarde

- Base : `data/database.sqlite` (créée et alimentée au premier démarrage).
- Secret de session : `data/session-secret.txt` (généré automatiquement).
- Sauvegarde : copiez le dossier `data/` (application arrêtée de préférence).
- Reprise d'une ancienne installation : si `data/database.sqlite` est absent,
  `backend/database.sqlite` est copié automatiquement au démarrage.
- Réinitialiser : fermez l'application et supprimez `data/database.sqlite`
  (les comptes, cycles et relevés sont alors perdus).

Un fichier `data/database.sqlite.lock` peut subsister après un arrêt brutal :
il est supprimé automatiquement au démarrage suivant.

## Structure

```
backend/            API Express
  src/server.js     démarrage, sessions, service de l'interface compilée
  src/db.js         schéma SQLite, données de référence, comptes
  src/routes/       routes /api (auth, cycles, relevés, mortalité, charges…)
frontend/           interface React (src/) compilée dans dist/
build/              application compilée prête à lancer (farmotic.cjs + public/)
data/               base SQLite et secret de session
scripts/build.mjs   compilation de l'interface et du serveur
```

## Comptes et rôles

- `admin` : accès complet, gestion des utilisateurs.
- `operateur` : saisie et modification des cycles, relevés, charges.
- `lecteur` : consultation seule.

Les comptes se gèrent dans *Utilisateurs* (visible par les administrateurs).
