# Tabletop Audio SoundPad Stream

Module communautaire non officiel pour **Foundry Virtual Tabletop v14**.

Il ouvre les SoundPads sur le site officiel de Tabletop Audio, capture uniquement le son de cet onglet avec l’autorisation explicite du MJ, puis le diffuse directement aux navigateurs des joueurs avec WebRTC.

## Ce que le module ne fait pas

- Il n’inclut, ne télécharge et ne copie aucun son de Tabletop Audio.
- Il ne contourne aucun abonnement ni aucune protection.
- Il n’enregistre pas le flux audio.
- Il ne fait pas transiter le son par le stockage de l’hébergeur Foundry.

## Prérequis

- Foundry VTT v14.
- Chrome ou Edge recommandé pour le MJ.
- Une connexion HTTPS à Foundry.
- Les joueurs doivent cliquer une fois sur **Activer l’écoute**.

## Installation

### Méthode A — URL de manifeste (recommandée)

1. Dans Foundry VTT, ouvrir **Configuration → Modules complémentaires → Installer un module**.
2. Coller cette URL dans le champ **URL du manifeste** :

   ```
   https://github.com/Ollipmac/tabletop-soundpad-stream/releases/latest/download/module.json
   ```

3. Cliquer sur **Installer**.
4. Activer **Tabletop Audio SoundPad Stream** dans les modules du monde.

C'est cette URL qu'il suffit de partager aux autres joueurs et MJ pour qu'ils installent le module.

### Méthode B — Installation manuelle

1. Télécharger `module.zip` depuis la [page des versions](https://github.com/Ollipmac/tabletop-soundpad-stream/releases).
2. Décompresser le contenu dans un dossier `tabletop-soundpad-stream/` du répertoire `Data/modules/` de Foundry.
3. Redémarrer Foundry si nécessaire.
4. Activer **Tabletop Audio SoundPad Stream** dans les modules du monde.

Sur un hébergeur, téléverser le dossier décompressé avec son gestionnaire de fichiers ou par SFTP.

## Utilisation

1. Le MJ ouvre l’outil depuis les contrôles de scène (icône d’antenne).
2. Il choisit puis ouvre un SoundPad.
3. Il clique sur **Démarrer la diffusion**.
4. Dans le sélecteur Chrome/Edge, il choisit l’onglet Tabletop Audio et active le partage de l’audio de l’onglet.
5. Les joueurs ouvrent l’outil avec l’icône casque et cliquent sur **Activer l’écoute**.

Le MJ peut continuer à déclencher les sons dans l’onglet officiel Tabletop Audio. Le module diffuse uniquement le mix audio résultant.

## Réseau et confidentialité

Le flux est envoyé en pair-à-pair (WebRTC) du navigateur du MJ vers chaque joueur. Le module utilise le serveur STUN public de Cloudflare pour faciliter l’établissement des connexions ; le son n’est pas relayé par ce serveur STUN.

Comme pour toute connexion WebRTC pair-à-pair, les participants peuvent techniquement connaître l’adresse IP publique des autres pairs en inspectant leur navigateur. N’utilise pas ce mode avec des personnes auxquelles tu ne souhaites pas exposer cette information réseau.

Certaines configurations réseau très restrictives peuvent exiger un serveur TURN. Aucun TURN payant ou secret n’est fourni dans cette version.

## Compatibilité

- Foundry VTT : v14.
- Systèmes de jeu : tous, notamment Foundryborne/Daggerheart.
- Navigateurs MJ : Edge et Chrome recommandés.

## API pour macros

```js
game.modules.get("tabletop-soundpad-stream").api.open();
game.modules.get("tabletop-soundpad-stream").api.start();
game.modules.get("tabletop-soundpad-stream").api.stop();
```

## Statut du projet

Version `0.1.0` : prototype fonctionnel à tester en conditions réelles avant utilisation sur une campagne principale.

## Marques et contenu

Tabletop Audio est un service tiers indépendant. Ce module n’est ni affilié à, ni approuvé par Tabletop Audio. Les liens ouvrent exclusivement le site officiel `tabletopaudio.com`.
