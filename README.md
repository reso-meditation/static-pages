# Pages Reso (AlumnForce)

Source versionnée des contenus collés dans le back-office AlumnForce de [reso.co](https://www.reso.co),
avec un outil d'aperçu qui reproduit le rendu du site.

AlumnForce n'exécute aucun JavaScript dans ces contenus : on n'y met que du HTML,
stylé par le CSS global du site.

## `custom-af-content/` : le contenu personnalisable

Tout ce qui se personnalise dans AlumnForce, **un fichier par formulaire du back-office** :

| Fichier | Formulaire AlumnForce | Ce qu'on en fait |
|---|---|---|
| `custom.css` | Éditeur CSS du site (servi sur `/site/css/show`) | Coller tel quel. **Partagé par toutes les pages** |
| `accueil.yaml` | Configuration du tableau de bord (page d'accueil des membres) | Reproduire la liste des widgets, dans l'ordre |
| `html-widget1.html` … `html-widget5.html` | Widgets « html libre » de l'accueil (dans l'ordre de `accueil.yaml`) | Coller tel quel, un par widget |
| `minuteur.html` | Page statique « Minuteur » | Coller tel quel |
| `menus.yaml` | Gestion du menu (menu principal et sous-menus) | Reproduire les entrées |

Pour un nouveau widget « html libre », créer `html-widget<n>.html` et l'ajouter à `accueil.yaml`.
Pour une nouvelle page statique, créer `<nom>.html` et l'ajouter à `preview/pages.yaml`.

### `accueil.yaml` : les widgets de l'accueil

La liste des widgets du tableau de bord, dans l'ordre, slider compris :

```yaml
- widget: slider
- html: html-widget1.html
  titre: Bandeau groupe de partage
- widget: nos-prochaines-rencontres
```

- `widget: <nom>` : widget dynamique d'AlumnForce (slider, agenda, articles…), rendu à partir de
  sa capture sur reso.co (`preview/site/widgets/<nom>.<largeur>.html`). Les noms disponibles et
  l'ordre actuel sur le site sont dans `preview/site/widgets/widgets.json`. Le slider est toujours
  en tête : sur reso.co, AlumnForce le place au-dessus des autres widgets.
- `html: <fichier>.html` : widget « html libre », fichier de ce dossier. `titre` (facultatif) est le
  nom affiché sur son bouton de copie dans la visionneuse.

Pour essayer un nouvel agencement, réordonner la liste ou y insérer des widgets « html libre ».

**Sections par catégorie** (proposition 2026, CSS dans `custom.css`, section « ACCUEIL MEMBRES ») :
l'accueil est découpé en sections, une par catégorie du menu. Une section commence par un widget
« html libre » qui contient son titre en pilule :

```html
<p class="reso-section reso-section--evenements">Événements &amp; actualité</p>
```

Tous les widgets qui suivent, jusqu'à la section suivante, prennent la couleur de la catégorie :
liseré gauche des cartes et bande de fond pleine largeur dans une teinte claire de la couleur,
sur laquelle le titre est à cheval (modèle « Événements & actualité » de la maquette). Un widget
ajouté dans une section prend donc ses couleurs sans toucher au CSS. Les couleurs et leurs teintes
sont des variables en tête de la section MENU PRINCIPAL de `custom.css` (`--menu_…`, `--menu_…_fond`). Les sections doivent rester
dans l'ordre du menu (`--etre-ensemble`, `--evenements`, `--enseignements`, `--pratique`, `--chemin`).

Autres classes disponibles pour les widgets « html libre » : `reso-card` (carte blanche, avec
`reso-card__badge`, `reso-card__title`, `reso-card__question`), `reso-group` (lien vers un groupe
avec vignette, voir `html-widget1.html`) et `reso-cta` / `reso-cta__button` (bouton centré).

Attention aux couleurs de liens : une feuille de style ajoutée par Vue **après** `custom.css`
colore tous les liens des widgets en bleu (`#2196f3`) avec un sélecteur plus fort. Pour imposer une
couleur à un lien, utiliser `!important` (l'aperçu le montre).

### `menus.yaml` : le menu

L'aperçu génère le menu de l'en-tête (bureau et mobile) à partir de ce fichier, avec le
balisage d'AlumnForce. Au départ, c'est une copie du menu actuel du site, capturé dans
`preview/site/production/menus.yaml` (même format) : comparer les deux montre les changements à faire
dans le back-office.

```yaml
- titre: Être ensemble
  lien: /page/comment-etre-ensemble-dans-reso
  sous-menu:
    - titre: Annuaire des membres
      lien: /addressbook/fullsearch/index
- titre: Timer
  lien: https://www.reso.co/page/minuteur
```

- `titre`, `lien` : texte et cible de l'entrée. Une URL complète (`https://…`) correspond à une
  entrée « lien externe » d'AlumnForce, dont le balisage diffère un peu : l'aperçu le reproduit.
- `sous-menu` (facultatif) : liste d'entrées, sur trois niveaux au plus, comme sur le site.

Pour cibler une entrée dans `custom.css`, utiliser son **lien**, identique dans l'aperçu et sur
le site. Les identifiants d'AlumnForce (`<li id="submenu-785">`) sont des numéros attribués à la
création de l'entrée : inconnus pour une nouvelle entrée, ils ne figurent donc pas dans
`menus.yaml`, et l'aperçu fabrique les siens à partir du titre.

```css
/* Entrée « Être ensemble » du menu bureau (le « > » évite son sous-menu, qui a le même lien) */
#header ul.nav > li > a[href="/page/comment-etre-ensemble-dans-reso"] { … }
```

Le menu mobile (`#header ul.nav-mobile`) a une autre structure : une catégorie avec sous-menu
y est `li > div a`, une entrée simple `li > a`. Vérifier les deux dans l'aperçu.

## Le reste du dépôt

| Chemin | Rôle |
|---|---|
| `index.html`, `preview.html`, `preview/` | Outil d'aperçu (rien à coller) |
| `preview/pages.yaml` | Pages affichées dans la visionneuse : `id`, `titre`, `type` (`page-statique` ou `accueil`), `contenu` (fichier de `custom-af-content/`), `url` sur reso.co |
| `preview/choix.yaml`, `preview/choix/` | Choix à trancher (palettes, options CSS, variantes du menu), voir plus bas |
| `preview/site/` | Captures de reso.co : en-tête, pied de page, widgets dynamiques, styles Vue |
| `preview/site/production/` | Le contenu personnalisable actuellement en ligne (même format que `custom-af-content/`) |
| `tools/` | Script de capture de reso.co |

## Aperçu en local

```sh
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. En local, l'aperçu se recharge tout seul quand un fichier
de `custom-af-content/` change. Une erreur dans un fichier YAML s'affiche dans les
avertissements de la visionneuse, et l'aperçu garde la dernière version valide.

La visionneuse permet de :
- choisir la largeur d'écran (bureau, portable, tablette, mobile) ;
- comparer la **Proposition** (`custom-af-content/`) et la **Production** (ce qui est en ligne) ;
- essayer les **choix** de `preview/choix.yaml` (panneau « Choix ») ;
- copier le contenu à coller dans AlumnForce (`custom.css`, un bouton par widget « html libre ») ;
- voir les avertissements (JavaScript, `<style>`, `<iframe>` sur l'accueil, widget inconnu,
  erreur dans un fichier YAML…).

### Comparer et choisir (réunions)

Deux réglages, **A** et **B**, chacun composé d'une version (Proposition ou Production) et, pour la
Proposition, d'une réponse à chaque choix. Par défaut : A = Proposition, B = Production.

- **◧ Comparer** (touche `C`) : A et B côte à côte, défilement synchronisé.
- **⇄ Basculer** (touche `B`) : échange A et B ; seul, c'est un « avant / après » instantané.
- **Panneau Choix** : une colonne de boutons par réglage (A, B en mode comparaison).
- **Copier le résumé** : la liste des choix de A (et B), avec le lien, pour un compte rendu.
- **Copier le lien** : l'adresse contient tout l'état (`#page=…&a=proposition~palette:charte&b=…`).

`preview/choix.yaml` décrit les questions et leurs réponses ; la première réponse de chaque
question est la proposition actuelle (`custom-af-content/`). Une réponse peut :
- ajouter un fichier CSS de `preview/choix/` juste après `custom.css` (palettes : variables
  `--menu_…` ; options : règles qui remplacent celles de `custom.css`) ;
- modifier le menu : `renommer` ou `retirer` des entrées, désignées par leur chemin
  (`"Être ensemble > Méditons ensemble"`). Les réponses de plusieurs questions se combinent.

Une réponse retenue en réunion s'intègre ensuite dans `custom-af-content/` (CSS dans
`custom.css`, menu dans `menus.yaml`) et devient la première réponse de sa question :
en production, seul `custom-af-content/` compte.

## Fidélité du rendu

- Les feuilles de style d'AlumnForce sont chargées **directement depuis reso.co**.
  L'aperçu suit donc les mises à jour de la plateforme.
- reso.co bloque le chargement de ses polices depuis un autre domaine (CORS). Elles sont donc :
  - copiées dans `preview/fonts/` : Lato et Montserrat (licence libre OFL) ;
  - FontAF (icônes AlumnForce, police propriétaire) : téléchargée par le script de capture dans
    `preview/fonts/af_font/`, non versionnée. Sans elle (aperçu publié), quelques icônes de
    l'en-tête et du pied de page manquent (loupe, menu ☰, barre du bas, réseaux sociaux) ;
  - ou chargées depuis jsDelivr : Material Design Icons.
- Les chemins absolus (`/medias/...`) du contenu et de `custom.css` pointent vers reso.co.
- Le contenu est rendu dans les mêmes conteneurs que sur le site. Pour l'accueil, Vue change
  les conteneurs et le balisage des widgets selon la largeur (breakpoints 600 et 960 px) :
  l'aperçu change de conteneurs (`BREAKPOINTS` dans `preview/preview.js`) et de capture
  (une par largeur : `bureau`, `tablette`, `mobile`).
- Sur reso.co, Vue ajoute **après** `custom.css` d'autres feuilles de style (thème Vuetify,
  styles des composants, CSS chargés à la demande). Elles l'emportent sur `custom.css` à
  sélecteur égal ; l'aperçu les insère au même endroit (`preview/site/styles.<type>.html`).
- L'en-tête et le pied de page (`preview/site/`) sont une capture du site en vue membre.
  Sous 600 px, l'en-tête inclut la barre de navigation orange fixée en bas de l'écran.
  La barre membre de gauche est simulée par un bandeau vide.
- Le menu se comporte comme sur le site : en bureau, les sous-menus s'ouvrent au survol
  (`setupDropdowns`) ; en mobile, le bouton ☰ ouvre le panneau et les chevrons déplient les
  catégories (`initMobileMenu`). `preview/preview.js` imite pour cela les scripts d'AlumnForce.
- Vérifié le 2026-11-06 : pour l'accueil, positions et tailles identiques au pixel près à
  1366, 768 et 390 px, et styles calculés identiques (couleurs, polices, tailles, arrondis).
- Ne sont pas reproduits : le bandeau de consentement cookies (Klaro) qui remplace les iframes
  tant que le visiteur n'a pas accepté, et le bouton de l'assistant.

### Mettre à jour les captures

Les captures (`preview/site/`) figent le site au moment où elles sont faites : contenu des
widgets (prochaines rencontres, replays…), menu, pied de page, styles Vue, et la version
Production (`preview/site/production/` : `custom.css` en ligne, widgets « html libre » de l'accueil,
ordre des widgets, menu). À refaire quand le site change, et après chaque mise en production :

```sh
cd tools && npm install && npx playwright-core install chromium   # une seule fois
cd .. && RESO_COOKIE='AFSESSID=…; PHPSESSID=…' node tools/capture-site-chrome.js
```

`RESO_COOKIE` contient les cookies d'une session membre connectée (outils de développement du
navigateur → Stockage → Cookies). Le script retire les scripts, remplace la photo de profil
par un avatar neutre et ignore le mur social (messages des membres).

Un compte admin voit à la fois le menu des membres et celui des visiteurs (bug AlumnForce) :
le script retire de l'en-tête les entrées réservées aux visiteurs, listées dans
`VISITOR_ONLY_MENU` (Présentation, Formations, Nous rejoindre).

## Mettre en ligne une modification

1. Modifier un fichier de `custom-af-content/`, et vérifier dans l'aperçu.
2. Commiter et pousser.
3. Reporter dans AlumnForce, formulaire par formulaire : coller les fichiers `.html` et
   `custom.css` (boutons « Copier » de la visionneuse ; dans l'éditeur de texte, passer en mode
   code `</>` avant de coller), et reproduire `accueil.yaml` et `menus.yaml` dans la
   configuration du tableau de bord et du menu.

`custom.css` touche **tout le site** : après une modification, vérifier les autres pages de l'aperçu.
