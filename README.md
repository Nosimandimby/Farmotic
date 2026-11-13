# Farmotic 🐔

Application de suivi d'élevage de poulets de chair : cycles (bandes), relevés
journaliers, mortalité, charges, références de croissance et indicateurs
technico-économiques (indice de consommation, coût par kilo, marge).

Interface React (Vite + Tailwind) et API **Python / FastAPI**, avec une base
SQLite locale. Tout fonctionne hors ligne, sur un seul PC ou un Raspberry Pi,
et l'application est installable en PWA sur Android.

---

## 🛠 Prérequis

- **Python 3.10 ou plus récent** (https://www.python.org/).
  *Sur Debian / Ubuntu / Raspberry Pi OS : `sudo apt install -y python3 python3-venv python3-pip`.*
- **Git** (pour cloner, maintenir et mettre à jour le projet).
- **pip** (installé avec Python ; le lanceur s'en sert pour installer les dépendances).

Node.js n'est **pas** nécessaire pour faire tourner l'application : il ne sert
que si vous souhaitez **recompiler l'interface React** (voir la section
« Modifier l'interface »).

---

## 🚀 Installation sur une nouvelle machine (depuis GitHub)

1. **Cloner le dépôt :**
   ```bash
   git clone https://github.com/Nosimandimby/Farmotic.git
   cd Farmotic
   ```

2. **Installer les dépendances Python :**
   ```bash
   python3 -m pip install -r requirements.txt
   ```

   *Si votre système refuse l'installation globale (message « externally-managed-environment », PEP 668),
   créez un environnement virtuel :*
   ```bash
   python3 -m venv .venv
   ./.venv/bin/python -m pip install -r requirements.txt
   ```
   *`lancer.py` fait ce repli automatiquement : vous pouvez aussi sauter cette étape et lancer
   directement l'application, elle installera ce qui manque.*

3. **Lancer l'application :**
   ```bash
   python3 lancer.py
   ```

   Le serveur démarre sur **http://127.0.0.1:3001** et le navigateur s'ouvre
   automatiquement. `lancer.py` vérifie les dépendances, les installe si besoin
   (dans `.venv` en cas de blocage système), choisit le premier port libre à
   partir de 3001, puis démarre Uvicorn.

**Compte par défaut :** login `admin`, mot de passe `admin`.
Pensez à le changer dans *Paramètres → Mon compte*.

---

## 🎛 Options de lancement

```bash
python3 lancer.py                     # port 3001, navigateur ouvert
PORT=3100 python3 lancer.py           # imposer le port
HOST=0.0.0.0 python3 lancer.py        # accessible depuis le réseau local
FARMOTIC_NO_OPEN=1 python3 lancer.py  # ne pas ouvrir le navigateur
python3 lancer.py --no-open           # idem, en argument
```

Il n'y a plus de script `start.sh` : `lancer.py` est l'unique point d'entrée,
y compris pour les unités systemd (voir la section Raspberry Pi).

Sous Windows, ces variables s'utilisent dans l'invite de commandes :

```bat
set PORT=3100
python lancer.py
```

---

## 🖥 Modifier l'interface (recompilation du frontend)

Le dossier `frontend/` n'a pas changé : c'est toujours React + Vite. Il faut
Node.js 20+ **uniquement** pour recompiler l'interface après une modification.

```bash
cd frontend
npm install
npm run build
```

Le build produit `frontend/dist/`, que le serveur Python sert automatiquement
(il préfère `build/public` s'il existe). Aucune autre commande n'est requise :
relancez `python3 lancer.py`.

En développement, l'API Python et le serveur Vite (proxy `/api`) se lancent
séparément :

```bash
python3 lancer.py --no-open     # API + interface compilée sur :3001
cd frontend && npm run dev      # interface à chaud sur :5173
```

---

## 💾 Données et sauvegarde

- Base : **`data/database.sqlite`** — conservée **telle quelle** par la migration.
  Mêmes tables, mêmes colonnes, mêmes types : aucun script de conversion n'est
  nécessaire.
- Secret de session : `data/session-secret.txt` (généré automatiquement, réutilisé
  par le backend Python : les sessions existantes restent valides).
- **Sauvegarde :** copiez le dossier `data/` (application arrêtée de préférence).
  *Le dossier `data/` est ignoré par Git pour éviter d'écraser vos données de
  production lors des mises à jour.*
- Ancienne base Node.js : `data/database.nodejs.sqlite` est une sauvegarde de
  la base d'avant la migration ; elle n'est utilisée que si
  `data/database.sqlite` est absent au premier démarrage. Vous pouvez la
  supprimer ou l'archiver une fois la migration confirmée.
- Réinitialiser : fermez l'application et supprimez `data/database.sqlite`
  (les comptes, cycles et relevés sont alors perdus).

---

## 💾 Sauvegarde et restauration

Depuis l'application : **Paramètres → Sauvegarde** (compte administrateur).

- **Exporter la base** — télécharge une copie complète et cohérente de la base
  sous un nom daté automatiquement, par exemple
  `farmotic-database-2026-11-13.sqlite`. Le fichier obtenu est une base SQLite
  standard : conservez-le sur une clé USB, un disque externe ou dans le cloud.
- **Restaurer une sauvegarde** — choisissez un fichier `.sqlite` exporté
  précédemment : l'application vérifie qu'il s'agit bien d'une base Farmotic,
  enregistre une copie de la base *actuelle* dans
  `data/database-avant-restauration-AAAA-MM-JJ-HHMMSS.sqlite`, puis la remplace.
  La page se recharge automatiquement.

Les deux opérations sont réservées aux administrateurs et nécessitent que
l'application soit en ligne. En ligne de commande :

```bash
# export (cookie de session requis)
curl -b cookies.txt -OJ http://127.0.0.1:3001/api/sauvegarde

# restauration
curl -b cookies.txt -X POST \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @farmotic-database-2026-11-13.sqlite \
  http://127.0.0.1:3001/api/sauvegarde/restauration
```

---

## 🔄 Migration depuis l'ancienne version Node.js

Rien à faire côté données : `main.py` lit et écrit la même base SQLite avec les
mêmes requêtes SQL, expose exactement les mêmes routes `/api/…` avec les mêmes
corps JSON, et signe le cookie `farmotic.sid` de la même manière. Les
utilisateurs déjà connectés le restent après le basculement.

Seule la commande de lancement change : `python3 lancer.py`.

---

## 🔁 Mises à jour

L'application est installée depuis le dépôt Git : mettre à jour consiste à
récupérer les derniers commits, réinstaller les dépendances Python si
`requirements.txt` a changé, puis — si `frontend/` ou un fichier de dépendances
a changé, ou si `node_modules/` est absent — installer les paquets npm (`npm ci`
quand `package-lock.json` a changé, sinon `npm install --no-audit --no-fund`) et
lancer `npm run build` (copie de `frontend/dist` vers `build/public`), et enfin
redémarrer le serveur.

### Depuis l'application (recommandé)

**Paramètres → À propos** affiche la version installée, lue dans le **tag Git**
le plus proche (`git describe`, par exemple `v2.1.0-2-gc7fcd62` → version
**2.1.0**), ainsi que la branche, le commit et la date du code. Hors dépôt Git,
la version retombe sur celle de `package.json`. Le bouton **Vérifier les mises à jour**
interroge le dépôt distant ; si une version plus récente existe, un bouton
**Mettre à jour** (administrateurs) l'installe puis **redémarre le serveur
automatiquement** — la page se recharge seule. Aucune commande à taper.

La mise à jour est refusée si des fichiers suivis par Git ont été modifiés
localement (validez-les d'abord) ; vos données (`data/`) ne sont jamais
touchées.

### En ligne de commande

```bash
python3 mettre_a_jour.py              # vérifie et applique la mise à jour
python3 mettre_a_jour.py --verifier   # affiche seulement l'état
python3 mettre_a_jour.py --sans-interface  # sans recompiler l'interface
```

Après une mise à jour en ligne de commande, relancez l'application à la main
(`python3 lancer.py`).

### API

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/version` | version installée, branche, commit, Python (connecté) |
| `GET` | `/api/maj/verifier` | état des mises à jour (administrateur) |
| `POST` | `/api/maj/appliquer` | installe et redémarre (administrateur) |

Pour publier une nouvelle version : créez un tag annoté (`git tag -a v2.2.0 -m
"Farmotic 2.2.0"`), alignez si vous le souhaitez le champ `version` de
`package.json`, puis poussez le tout (`git push origin main --tags`). Les
installations se mettront à jour d'elles-mêmes depuis l'interface.

---

## 🍓 Raspberry Pi (arm64) et autres machines

Farmotic tourne sur un Raspberry Pi sans compilation native : SQLite est fourni
par Python, et `bcrypt` (vérification des mots de passe) est disponible en
paquets précompilés pour arm64.

### Installation sur Raspberry Pi OS 64 bits

1. Installez Python 3.10+ et les outils associés :
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-venv python3-pip git
   ```
2. Suivez ensuite les étapes d'installation standard depuis GitHub
   (`python3 -m pip install -r requirements.txt` ou `python3 lancer.py`).

L'interface est déjà compilée dans le dépôt (`build/public`). Si vous modifiez
React sur le Pi, faites-le plutôt sur un PC plus puissant : compiler Vite sur un
Pi demande beaucoup de mémoire.

### Accès depuis un téléphone ou un autre poste

Par défaut l'application n'écoute que sur la machine locale. Pour l'ouvrir depuis
un autre appareil du réseau (utile dans un élevage) :

```bash
HOST=0.0.0.0 python3 lancer.py
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
User=votre_nom_d_utilisateur
Group=votre_nom_d_utilisateur
WorkingDirectory=/home/votre_nom_d_utilisateur/Farmotic
Environment=HOST=0.0.0.0
Environment=PORT=3001
Environment=FARMOTIC_NO_OPEN=1
ExecStart=/home/votre_nom_d_utilisateur/Farmotic/.venv/bin/python3 /home/votre_nom_d_utilisateur/Farmotic/lancer.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

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

---

## 📱 PWA / installation sur Android

L'interface est une PWA (manifeste, icônes, service worker) : installation
possible depuis Chrome et consultation hors-ligne des données déjà chargées.
L'installation « native » exige **HTTPS** (ou `localhost`) : en HTTP simple,
Chrome ne propose que « Ajouter à l'écran d'accueil ». Pour du HTTPS local,
utilisez Caddy ou Nginx en reverse-proxy vers `http://localhost:3001`.

---

## 📂 Structure du projet

```
main.py             API FastAPI (toutes les routes /api + service de l'interface)
lancer.py           lanceur : dépendances, port libre, Uvicorn, navigateur
maj.py              vérification et installation des mises à jour (stdlib)
mettre_a_jour.py    script de mise à jour en ligne de commande
dev.sh              lancement en développement (API Python + Vite)
requirements.txt    dépendances Python
frontend/           interface React (src/) compilée dans dist/
build/              interface compilée prête à servir (build/public)
data/               base SQLite et secret de session (ignoré par Git)
```

---

## 👥 Comptes et rôles

- `admin` : accès complet, gestion des utilisateurs, sauvegarde/restauration et
  mises à jour.
- `operateur` : tout le suivi d'élevage — cycles, relevés, mortalités, charges,
  ventes, références, paramètres de suivi et préférences — **sans** la section
  *Utilisateurs* ni les opérations système (sauvegarde/restauration, mises à
  jour).
- `lecteur` : consultation seule. Les boutons d'écriture sont désactivés dans
  l'interface et l'API refuse toute création/modification/suppression
  (`403 — Votre compte est en lecture seule : modification impossible.`).

Les comptes se gèrent dans *Utilisateurs* (visible par les administrateurs).
Les rôles sont vérifiés côté serveur : les dépendances `ecriture_requise`
(admin + opérateur) et `administrateur_requis` (admin) protègent toutes les
routes d'écriture.

---

## 🧰 Dépannage

| Symptôme | Solution |
| --- | --- |
| `externally-managed-environment` lors du `pip install` | Utilisez un venv (`python3 -m venv .venv`) ou laissez `lancer.py` le créer. |
| `Port 3001 occupé` | `lancer.py` prend automatiquement le port suivant ; sinon `PORT=3100 python3 lancer.py`. |
| « L'interface n'est pas compilée » | Le dossier `build/public` ou `frontend/dist` est absent : `cd frontend && npm install && npm run build`. |
| Mot de passe oublié | Arrêtez l'application, renommez `data/database.sqlite`, relancez : un compte `admin`/`admin` est recréé (les données sont perdues). |

---

## 🧹 Ancien backend Node.js (supprimé)

Le backend Express et ses outils ont été retirés du projet : plus de dossier
`backend/`, de `scripts/build.mjs`, d'`install.sh` ni de bundle
`build/farmotic.cjs`. Il ne reste côté Node que `frontend/` (Vite), nécessaire
uniquement pour recompiler l'interface.

Le lanceur Windows `Demarrer-Farmotic.bat` appelle désormais `lancer.py`.
