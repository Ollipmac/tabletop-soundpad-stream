# Installation rapide sur un hébergement Foundry

1. Décompresse `tabletop-soundpad-stream.zip` sur ton ordinateur.
2. Envoie le dossier complet `tabletop-soundpad-stream` dans `Data/modules/` sur ton hébergement.
3. Redémarre l’instance Foundry si le module n’apparaît pas immédiatement.
4. Ouvre ton monde, puis **Configuration du jeu → Gérer les modules**.
5. Coche **Tabletop Audio SoundPad Stream** et recharge le monde.

## Premier test

1. Connecte un compte joueur dans une fenêtre privée du navigateur.
2. Côté MJ, clique sur l’icône d’antenne dans les contrôles de scène.
3. Ouvre **DM Tools** ou **Combat**.
4. Clique sur **Démarrer la diffusion**.
5. Choisis l’onglet Tabletop Audio et coche le partage audio.
6. Côté joueur, clique sur l’icône casque puis **Activer l’écoute**.

Si le joueur reste sur « Connexion… », vérifie que les deux navigateurs autorisent WebRTC et qu’aucun VPN ou pare-feu strict ne bloque l’UDP.

## Important

La fenêtre de partage du navigateur montre plusieurs onglets. Sélectionne uniquement l’onglet Tabletop Audio. Le module arrête immédiatement la piste vidéo et ne conserve que le son.
