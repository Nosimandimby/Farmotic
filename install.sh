#!/bin/bash

# =================================================================
# Script d'installation automatique pour Farmotic
# =================================================================

set -e # Arrête le script en cas d'erreur

echo "🐔 Démarrage de l'installation de Farmotic..."
echo "---------------------------------------------------"

# 1. Vérification de Node.js
echo "🔍 Vérification de Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé."
    echo "👉 Veuillez installer Node.js 20+ manuellement (voir le README.md) avant de relancer ce script."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Votre version de Node.js est trop ancienne (v$(node -v))."
    echo "👉 Farmotic nécessite Node.js 20 ou plus récent."
    echo "👉 Veuillez suivre les instructions du README.md pour mettre à jour Node.js (via nvm ou NodeSource)."
    exit 1
fi
echo "✅ Node.js $(node -v) détecté."

# 2. Vérification de Git
echo "🔍 Vérification de Git..."
if ! command -v git &> /dev/null; then
    echo "❌ Git n'est pas installé. Veuillez l'installer (sudo apt install git)."
    exit 1
fi
echo "✅ Git détecté."

# 3. Installation des dépendances Node.js
echo "📦 Installation des dépendances (cela peut prendre quelques minutes)..."
npm install

# 4. Compilation de l'application
echo "🔨 Compilation de l'application..."
npm run build

# 5. Message de fin
echo "---------------------------------------------------"
echo "🎉 Installation terminée avec succès !"
echo ""
echo "Pour lancer l'application, tapez :"
echo "  ./start.sh"
echo ""
echo "Identifiants par défaut :"
echo "  Utilisateur : admin"
echo "  Mot de passe : admin"
echo "==================================================="
