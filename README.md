# Pages Reso (AlumnForce)

Source versionnée des contenus collés dans le back-office AlumnForce de [reso.co](https://www.reso.co),
avec un outil d'aperçu qui reproduit le rendu du site.

AlumnForce n'exécute aucun JavaScript dans ces contenus : on n'y met que du HTML,
stylé par le CSS global du site.

## Contenu

| Chemin | Rôle | Où le coller dans AlumnForce |
|---|---|---|
| `custom.css` | CSS global du site, **partagé par toutes les pages** | Éditeur CSS du site (servi sur `/site/css/show`) |
| `pages/<id>.html` | Fragment HTML d'une page | Page statique, ou widget « html libre » de l'accueil |
| `pages/pages.json` | Liste des pages affichées dans l'aperçu | — |
| `index.html`, `preview.html`, `preview/` | Outil d'aperçu (pas à coller) | — |

Chaque entrée de `pages/pages.json` :

```json
{ "id": "minuteur", "titre": "Minuteur", "type": "page-statique", "url": "https://www.reso.co/page/minuteur" }
```

- `id` : nom du fichier `pages/<id>.html` ;
- `type` : `page-statique` ou `accueil` (widget « html libre » du tableau de bord membre).
  Le type choisit les conteneurs HTML dans lesquels le fragment est rendu (voir `preview.html`) ;
- `url` : la page correspondante sur reso.co.

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
  ces conteneurs selon la largeur (breakpoints 600 et 960 px) : l'aperçu fait de même
  (`BREAKPOINTS` dans `preview/preview.js`).
- L'en-tête et le pied de page (`preview/site/`) sont une capture du site en vue membre.
  Sous 600 px, l'en-tête inclut la barre de navigation orange fixée en bas de l'écran.
  La barre membre de gauche est simulée par un bandeau vide.
- Ne sont pas reproduits : le bandeau de consentement cookies (Klaro) qui remplace les iframes
  tant que le visiteur n'a pas accepté, et le bouton de l'assistant.

### Mettre à jour l'en-tête et le pied de page

Quand le menu ou le pied de page du site change :

```sh
cd tools && npm install && npx playwright-core install chromium   # une seule fois
cd .. && RESO_COOKIE='AFSESSID=…; PHPSESSID=…' node tools/capture-site-chrome.js
```

`RESO_COOKIE` contient les cookies d'une session membre connectée (outils de développement du
navigateur → Stockage → Cookies). Le script retire les scripts et remplace la photo de profil
par un avatar neutre.

## Mettre en ligne une modification

1. Modifier `pages/<id>.html` et/ou `custom.css`, et vérifier dans l'aperçu.
2. Commiter, pousser : l'aperçu est publié sur GitHub Pages.
3. Coller le contenu dans AlumnForce (bouton « Copier le HTML » / « Copier custom.css »).
   Dans l'éditeur de texte, passer en mode code (`</>`) avant de coller.

`custom.css` touche **tout le site** : après une modification, vérifier les autres pages de l'aperçu.
