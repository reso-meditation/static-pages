# Pages Reso (AlumnForce)

Source versionnée des contenus collés dans le back-office AlumnForce de [reso.co](https://www.reso.co),
avec un outil d'aperçu qui reproduit le rendu du site.

AlumnForce n'exécute aucun JavaScript dans ces contenus : on n'y met que du HTML,
stylé par le CSS global du site.

## Contenu

| Chemin | Rôle | Où le coller dans AlumnForce |
|---|---|---|
| `custom.css` | CSS global du site, **partagé par toutes les pages** | Éditeur CSS du site (servi sur `/site/css/show`) |
| `pages/*.html` | Fragment HTML d'une page statique, ou d'un widget « html libre » de l'accueil | Page statique / widget « html libre » |
| `pages/pages.json` | Liste des pages affichées dans l'aperçu | — |
| `preview/site/` | Captures de reso.co : en-tête, pied de page, widgets dynamiques, styles Vue | — (généré par `tools/`) |
| `index.html`, `preview.html`, `preview/` | Outil d'aperçu (pas à coller) | — |

Chaque entrée de `pages/pages.json` a un `id`, un `titre`, un `type` et l'`url` de la page sur reso.co.

**Page statique** (`"type": "page-statique"`) : le fragment est `pages/<id>.html`.

```json
{ "id": "minuteur", "titre": "Minuteur", "type": "page-statique", "url": "https://www.reso.co/page/minuteur" }
```

**Accueil** (`"type": "accueil"`) : le tableau de bord membre, décrit comme sur le site,
c'est-à-dire le slider (optionnel) puis une **suite de widgets**, dans l'ordre :

```json
{
  "id": "accueil-membres", "titre": "Accueil membres", "type": "accueil", "url": "https://www.reso.co/",
  "slider": true,
  "widgets": [
    { "html": "pages/accueil-membres.html", "titre": "Bandeau groupe de partage" },
    { "capture": "nos-prochaines-rencontres" }
  ]
}
```

- `{ "html": "pages/….html", "titre": "…" }` : widget « html libre », dont le contenu est versionné ici.
  La visionneuse affiche un bouton de copie par widget de ce type.
- `{ "capture": "…" }` : widget dynamique d'AlumnForce (agenda, articles…), rendu à partir de sa
  capture `preview/site/widgets/<nom>.<largeur>.html`. La liste des widgets capturés et leur ordre
  sur le site sont dans `preview/site/widgets/widgets.json`.

Pour essayer un nouvel agencement, il suffit de réordonner `widgets` ou d'y insérer des
widgets « html libre ».

## Aperçu en local

```sh
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. En local, l'aperçu se recharge tout seul
quand `custom.css` ou une page change.

La visionneuse permet de :
- choisir la largeur d'écran (bureau, portable, tablette, mobile) ;
- copier le HTML ou `custom.css`, prêt à coller dans AlumnForce ;
- voir les avertissements (JavaScript, `<style>`, `<iframe>` sur l'accueil…).

## Fidélité du rendu

- Les feuilles de style d'AlumnForce sont chargées **directement depuis reso.co**.
  L'aperçu suit donc les mises à jour de la plateforme.
- reso.co bloque le chargement de ses polices depuis un autre domaine (CORS). Elles sont donc :
  - copiées dans `preview/fonts/` : Lato, Montserrat et FontAF (icônes AlumnForce) ;
  - ou chargées depuis jsDelivr : Material Design Icons.
- Les chemins absolus (`/medias/...`) des pages et de `custom.css` pointent vers reso.co.
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
- Vérifié le 2026-11-06 : pour l'accueil, positions et tailles identiques au pixel près à
  1366, 768 et 390 px, et styles calculés identiques (couleurs, polices, tailles, arrondis).
- Ne sont pas reproduits : le bandeau de consentement cookies (Klaro) qui remplace les iframes
  tant que le visiteur n'a pas accepté, et le bouton de l'assistant.

### Mettre à jour les captures

Les captures (`preview/site/`) figent le site au moment où elles sont faites : contenu des
widgets (prochaines rencontres, replays…), menu, pied de page, styles Vue. À refaire quand
le site change :

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

1. Modifier un fichier de `pages/` et/ou `custom.css`, et vérifier dans l'aperçu.
2. Commiter, pousser : Netlify publie l'aperçu (configuration dans `netlify.toml`).
   Une pull request donne un aperçu séparé (deploy preview), pour faire relire avant de coller.
3. Coller le contenu dans AlumnForce (bouton « Copier le HTML » / « Copier custom.css »).
   Dans l'éditeur de texte, passer en mode code (`</>`) avant de coller.

`custom.css` touche **tout le site** : après une modification, vérifier les autres pages de l'aperçu.
