# Référencement français — chantier du 10/10/2026

La vitrine commerciale de référence reste BApps Studio. Les redirections SSO, abonnements et paiements ne changent pas.

- Origine indexable : https://dartsopen.bapps-studio.com. NEXT_PUBLIC_APP_URL absent, inconnu ou de recette = noindex.
- Les écrans opérationnels reçoivent X-Robots-Tag: noindex, nofollow ; cela ne remplace jamais l'authentification.
- Les URL canoniques sont absolues. Les paramètres de recherche ne créent pas de variantes éditoriales.
- Aucun changement de langue : le français reste actif, EN/ES restent masqués.
- Les sitemaps ne contiennent pas de jeton, retour d'achat, widget ou écran connecté.
- Les sitemaps dynamiques font une lecture minimale des contenus publiés, sans convertir une panne DB en sitemap vide. En cas de croissance vers 50 000 URL, les partitionner avant de dépasser la limite du protocole.
- Les données structurées décrivent les contenus visibles, sans avis, prix ni adresses inventés. Le type Event ne garantit pas l'éligibilité Google : une adresse de lieu structurée devra être disponible pour satisfaire tous ses critères.

Avant fusion : CI complète, vérification des métadonnées et fichiers SEO en prévisualisation, puis autorisation de promotion. Après publication autorisée : contrôles HTTP et soumission des sitemaps dans Search Console.
