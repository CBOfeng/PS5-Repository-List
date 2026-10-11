# GitShelf Hub - Déploiement GitHub Pages

Ce dépôt contient votre gestionnaire de dépôts GitHub avec la base de données JSON et l'interface Web Vue.js.

## Structure
- `index.html` : Visualiseur Vue.js 3 + Tailwind CSS ultra-léger et réactif.
- `json/repos-database.json` : Votre base de données complète synchronisée depuis GitShelf Manager.
- `.github/workflows/deploy.yml` : Déploiement automatique vers GitHub Pages à chaque commit.

## Activation de GitHub Pages
1. Rendez-vous dans **Settings** > **Pages** sur votre dépôt GitHub.
2. Sous **Build and deployment**, sélectionnez la source **GitHub Actions**.
3. Tout commit sur la branche `main` mettra à jour votre hub en quelques secondes !
