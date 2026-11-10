# Farmotic 🐔

Application de suivi d'élevage de poulets de chair : cycles (bandes), relevés
journaliers, mortalité, charges, références de croissance et indicateurs
technico-économiques (indice de consommation, coût par kilo, marge).

Interface React (Vite + Tailwind) et API Node.js/Express, avec une base SQLite
locale. Tout fonctionne hors ligne, sur un seul PC.

---

## 🛠 Prérequis

- **Node.js 20 ou plus récent** (https://nodejs.org/).
  *⚠️ Attention : Les versions antérieures (v18 et moins) ne sont plus supportées par les dépendances de build (Vite, Tailwind) et provoqueront des erreurs `EBADENGINE` et des échecs de compilation.*
- **Git** (pour cloner, maintenir et mettre à jour le projet).
- **npm** (installé automatiquement avec Node.js).

---

## 🟢 Installation de Node.js 20 (Étape obligatoire)

Pour éviter les erreurs de compilation, vous devez installer **Node.js 20 LTS**. Voici les instructions selon votre système d'exploitation.

### 🐧 Sur Linux (Debian / Ubuntu / Raspberry Pi OS)

La méthode la plus propre et la plus flexible est d'utiliser `nvm` (Node Version Manager). Cela vous permet d'installer Node 20 sans toucher au Node système.

1. **Installer nvm :**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   ```

2. **Recharger votre terminal** (ou fermer/rouvrir le terminal) :
   ```bash
   source ~/.bashrc
   ```

3. **Installer et activer Node.js 20 :**
   ```bash
   nvm install 20
   nvm use 20
   nvm alias default 20
   ```

4. **Vérifier la version :**
   ```bash
   node -v   # Doit afficher v20.x.x
   ```

> **Alternative (sans nvm) :** Si vous préférez utiliser le gestionnaire de paquets système, utilisez le dépôt officiel NodeSource :
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt install -y nodejs
> ```

### 🪟 Sur Windows

1. Allez sur [nodejs.org](https://nodejs.org/).
2. Téléchargez la version **LTS** (qui correspond à Node.js 20).
3. Lancez l'installateur `.msi` et suivez les étapes (laissez les options par défaut, cela installera aussi `npm` et ajoutera Node au `PATH`).
4. **Vérifiez l'installation** en ouvrant une nouvelle invite de commandes (`cmd`) ou PowerShell :
   ```bat
   node -v
   ```
   *Doit afficher `v20.x.x`.*

### 🍎 Sur macOS

1. Allez sur [nodejs.org](https://nodejs.org/).
2. Téléchargez la version **LTS** (Node.js 20).
3. Lancez le fichier `.pkg` et suivez les instructions.
4. Vérifiez avec `node -v` dans le Terminal.

> **Alternative recommandée sur macOS :** Utilisez `nvm` via Homebrew (`brew install nvm`) pour gérer plusieurs versions de Node.js.

---

## 🚀 Installation sur une nouvelle machine (depuis GitHub)

Une fois Node.js 20 installé, suivez ces étapes pour récupérer et lancer l'application :

1. **Cloner le dépôt :**
   ```bash
   git clone https://github.com/Nosimandimby/Farmotic.git
   cd Farmotic
   ```

2. **Installer les dépendances :**
   *(Ne jamais utiliser `sudo` pour cette commande, sous peine de problèmes de permissions irréversibles sur le dossier `node_modules`)*
   ```bash
   npm install
   ```

3. **Lancer l'application :**
   | Système | Commande |
   | --- | --- |
   | Linux / macOS | `./start.sh` |
   | Windows | double-clic sur `Demarrer-Farmotic.bat` |

Le script compile l'application si nécessaire (`build/`), démarre le serveur puis ouvre le navigateur sur http://127.0.0.1:3001.

**Compte par défaut :** login `admin`, mot de passe `admin`.
Pensez à le changer dans *Paramètres → Mon compte*.

---

## 🔄 Mise à jour de l'application (Workflow Git)

Lorsque vous modifiez le code sur votre machine de développement et que vous souhaitez publier une mise à jour, suivez ce cycle :

### 1. Sur la machine de développement (Créer la mise à jour)
```bash
git add .
git commit -m "Description claire de la modification (ex: Fix: correction du calcul de mortalité)"
git push
```

### 2. Sur les machines de production (Appliquer la mise à jour)
```bash
git pull
# Si de nouvelles dépendances ont été ajoutées lors de la mise à jour :
npm install
# Relancer l'application
./start.sh
```

> **⚠️ Règle d'or :** Ne modifiez jamais le code directement sur une machine de production. Centralisez toujours vos développements sur une seule machine, puis déployez via GitHub. Le dossier `data/` (base de données) est protégé et ne sera jamais écrasé par un `git pull`.

---

## 🍓 Raspberry Pi (arm64) et autres machines

Farmotic tourne aussi sur un Raspberry Pi : la base SQLite est embarquée en WebAssembly (`node-sqlite3-wasm`) et le mot de passe utilise `bcryptjs`, tous deux indépendants du processeur. Aucune compilation native n'est nécessaire.

### Installation sur Raspberry Pi OS 64 bits

1. Assurez-vous d'avoir Node.js 20+ (voir la section "Installation de Node.js 20" ci-dessus, via `nvm` ou NodeSource).
2. Puis suivez les étapes d'installation standard depuis GitHub.

*Note sur les performances :* Sur un Pi, la compilation peut prendre plusieurs minutes et demande de la mémoire. Si elle échoue par manque de RAM, ajoutez du swap (`sudo dphys-swapfile setup`).

### Accès depuis un téléphone ou un autre poste

Par défaut l'application n'écoute que sur la machine locale. Pour l'ouvrir depuis un autre appareil du réseau (utile dans un élevage) :

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

Sur un Pi sans écran, laissez `FARMOTIC_NO_OPEN=1` : le serveur démarre sans tenter d'ouvrir un navigateur.

---

## ⚙️ Options utiles

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

---

## 💻 Mode développement

```bash
./dev.sh        # ou : npm run dev
```

- Interface : http://localhost:5173 (rechargement à chaud)
- API : http://localhost:3001 (proxy `/api` configuré dans Vite)

---

## 🔨 Compilation manuelle

```bash
npm install        # dépendances
npm run build      # interface -> build/public, serveur -> build/farmotic.cjs
npm start          # équivalent à : node build/farmotic.cjs
```

`npm run serve` démarre directement les sources (`backend/src/server.js`) sans compilation, à condition que l'interface soit déjà compilée.

---

## 💾 Données et sauvegarde

- Base : `data/database.sqlite` (créée et alimentée au premier démarrage).
- Secret de session : `data/session-secret.txt` (généré automatiquement).
- **Sauvegarde :** copiez le dossier `data/` (application arrêtée de préférence).
  *Le dossier `data/` est ignoré par Git pour éviter d'écraser vos données de production lors des mises à jour.*
- Réinitialiser : fermez l'application et supprimez `data/database.sqlite` (les comptes, cycles et relevés sont alors perdus).

---

## 📂 Structure du projet

```
backend/            API Express
  src/server.js     démarrage, sessions, service de l'interface compilée
  src/db.js         schéma SQLite, données de référence, comptes
  src/routes/       routes /api (auth, cycles, relevés, mortalité, charges…)
frontend/           interface React (src/) compilée dans dist/
build/              application compilée prête à lancer (farmotic.cjs + public/)
data/               base SQLite et secret de session (ignoré par Git)
scripts/build.mjs   compilation de l'interface et du serveur
```

---

## 👥 Comptes et rôles

- `admin` : accès complet, gestion des utilisateurs.
- `operateur` : saisie et modification des cycles, relevés, charges.
- `lecteur` : consultation seule.

Les comptes se gèrent dans *Utilisateurs* (visible par les administrateurs).

