# Créer un nouveau template

1. Créer un dossier `templates/brands/<brand>/<template-id>/`.
2. Ajouter `template.svg` (ou `slide-01.svg`… pour un carrousel) et `config.json`.
3. Déclarer chaque placeholder `{{FIELD}}` dans `config.json` et dans le SVG.
4. Verrouiller couleurs, polices, coordonnées, logo, cadres dans le SVG.
5. Ne jamais exposer d’éditeur libre (couleurs, polices, positions).
6. Valider avec les tests `template-config-validation`.

L’IA ne doit remplir que les champs dynamiques autorisés.
