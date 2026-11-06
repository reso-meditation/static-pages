// Capture des éléments de reso.co gérés par AlumnForce, pour l'aperçu :
//  - preview/site/header.html, preview/site/footer.html : en-tête et pied de page (vue membre) ;
//  - preview/site/widgets/<widget>.<largeur>.html : slider et widgets dynamiques du tableau de bord
//    de l'accueil, à trois largeurs (Vue génère un balisage différent selon la largeur) ;
//  - preview/site/widgets/widgets.json : liste et ordre des widgets tels qu'ils sont sur le site ;
//  - preview/site/production/ : le contenu personnalisable actuellement en ligne, au même format que
//    custom-af-content/ (custom.css, accueil.yaml, html-widget<n>.html, menus.yaml), pour comparer.
// Tout est nettoyé : sans scripts, sans attributs Vue/JS, sans photo de profil ni mur social.
//
// Usage (depuis la racine du dépôt) :
//   cd tools && npm install && npx playwright-core install chromium   # une seule fois
//   RESO_COOKIE='AFSESSID=…; PHPSESSID=…' node tools/capture-site-chrome.js
// RESO_COOKIE : cookies d'une session membre connectée (outils de développement du navigateur).
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ORIGIN = 'https://www.reso.co';
const OUT = path.join(__dirname, '..', 'preview', 'site');
const PROD = path.join(OUT, 'production');

// Bug AlumnForce : un compte admin voit à la fois le menu des membres et celui des visiteurs.
// Entrées du menu réservées aux visiteurs, retirées de la capture pour montrer le menu d'un membre.
const VISITOR_ONLY_MENU = {
  'submenu-180': 'Présentation',
  'submenu-1286': 'Formations',
  'submenu-190': 'Nous rejoindre'
};

// Largeurs de capture : une par breakpoint Vuetify (voir BREAKPOINTS dans preview/preview.js).
const WIDTHS = { bureau: 1366, tablette: 768, mobile: 390 };

const AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#d9d6cf"/>' +
  '<circle cx="20" cy="15" r="7" fill="#fff"/><path d="M6 38c2-9 8-13 14-13s12 4 14 13z" fill="#fff"/></svg>');

// Exécuté dans la page : copie nettoyée d'un élément.
function cleanInPage(selectorOrNull, avatar, removeIds, el) {
  const c = (el || document.querySelector(selectorOrNull)).cloneNode(true);
  c.querySelectorAll('script, noscript, template, iframe, link, style, .v-ripple__container').forEach(n => n.remove());
  c.querySelectorAll('[id^="fullsearch-toolbar-results"], .modal').forEach(n => n.remove());
  removeIds.forEach(id => c.querySelectorAll('[id="' + id + '"]').forEach(n => n.remove()));
  c.querySelectorAll('img[src*="/medias/profile/"]').forEach(img => { img.src = avatar; img.removeAttribute('srcset'); });
  c.querySelectorAll('*').forEach(n => {
    // Les attributs data-v-… sont gardés : les styles « scoped » des composants Vue les ciblent.
    [...n.attributes].forEach(a => { if (/^(on|@|:|v-on|v-bind)/.test(a.name)) n.removeAttribute(a.name); });
  });
  return c.outerHTML.replace(/\n\s*\n+/g, '\n');
}

// Exécuté dans la page : feuilles de style ajoutées après custom.css (/site/css/show), dans l'ordre.
// Vue les injecte au chargement (thème Vuetify, styles des composants, CSS chargés à la demande) :
// elles l'emportent sur custom.css à sélecteur égal, l'aperçu doit donc les reproduire.
function stylesAfterCustomInPage() {
  const all = [...document.querySelectorAll('link[rel="stylesheet"], style')];
  const i = all.findIndex(e => e.tagName === 'LINK' && e.href.includes('/site/css/show'));
  return all.slice(i + 1).map(e => e.tagName === 'LINK'
    ? '<link rel="stylesheet" href="' + e.href.replace(/\?version=\d+$/, '') + '">'
    : '<style' + (e.id ? ' id="' + e.id + '"' : '') + '>' + e.textContent + '</style>').join('\n');
}

// YAML minimal pour le menu : listes d'objets dont les valeurs sont des chaînes, des nombres ou des listes.
function yamlScalar(v) {
  if (typeof v === 'number') return String(v);
  const plain = /^[^\s'"#&*!|>%@`{}\[\],?:-]/.test(v) && !/: |\s#|:$|\s$/.test(v) &&
    !/^(true|false|null|yes|no|on|off|~|[-+]?\d+(\.\d+)?)$/i.test(v);
  return plain ? v : JSON.stringify(v);
}
function toYaml(items, indent = '') {
  return items.map(item => Object.entries(item).map(([k, v], i) => {
    const prefix = indent + (i === 0 ? '- ' : '  ');
    return Array.isArray(v) ? prefix + k + ':\n' + toYaml(v, indent + '    ') : prefix + k + ': ' + yamlScalar(v) + '\n';
  }).join('')).join('');
}

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function newContext(browser, cookies, width) {
  const mobile = width < 600;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies(cookies);
  return ctx;
}

// Fait défiler la page (et les carrousels mobiles) pour déclencher le chargement des images.
async function loadLazyImages(page) {
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await wait(150); }
    // Carrousels (mobile, tablette) : à l'écran d'abord, sinon les images ne se chargent pas.
    for (const sc of document.querySelectorAll('.slides-container')) {
      sc.scrollIntoView({ block: 'center' });
      await wait(200);
      for (let x = 0; x <= sc.scrollWidth; x += 150) { sc.scrollLeft = x; await wait(200); }
      await wait(300);
      sc.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  return page.$$eval('[data-tag-id="instance-layout-user-dashboard"] .v-image__image--preload', l => l.length);
}

(async () => {
  const raw = process.env.RESO_COOKIE;
  if (!raw) { console.error('Variable RESO_COOKIE manquante (cookies de session reso.co).'); process.exit(1); }
  const cookies = raw.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf('=');
    return { name: s.slice(0, i), value: s.slice(i + 1), domain: 'www.reso.co', path: '/' };
  });
  const stamp = '<!-- Capturé sur ' + ORIGIN + ' le ' + new Date().toISOString().slice(0, 10) +
    ' par tools/capture-site-chrome.js — ne pas modifier à la main -->\n';
  // FontAF, police d'icônes propriétaire d'AlumnForce : téléchargée pour l'aperçu local, non versionnée
  const fontDir = path.join(__dirname, '..', 'preview', 'fonts', 'af_font');
  fs.mkdirSync(fontDir, { recursive: true });
  const font = await fetch(ORIGIN + '/templates/common/fonts/af_font/FontAF.woff');
  if (font.ok) fs.writeFileSync(path.join(fontDir, 'FontAF.woff'), Buffer.from(await font.arrayBuffer()));
  else console.warn('FontAF non téléchargée (HTTP ' + font.status + ')');

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

  // 1. En-tête et pied de page
  let ctx = await newContext(browser, cookies, WIDTHS.bureau);
  let page = await ctx.newPage();
  await page.goto(ORIGIN + '/page/minuteur', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  if (!(await page.$('#header a[href*="logout"]'))) {
    console.error('La page ne semble pas connectée : vérifiez RESO_COOKIE.');
    await browser.close();
    process.exit(1);
  }
  const ids = Object.keys(VISITOR_ONLY_MENU);
  const header = await page.evaluate(async ([fn, avatar, ids]) => {
    // Sous-menus du menu bureau : le serveur les envoie dans chaque <li>, puis le script AlumnForce
    // les en retire au chargement (il les réaffiche au survol). On les reprend du HTML du serveur.
    const server = new DOMParser().parseFromString(await (await fetch(location.href, { credentials: 'include' })).text(), 'text/html');
    const header = document.querySelector('#header').cloneNode(true);
    header.querySelectorAll('ul.nav:not(.nav-mobile) > li[id]').forEach(li => {
      const sub = server.querySelector('ul.nav:not(.nav-mobile) > li[id="' + li.id + '"] > ul.dropdown-menu');
      if (sub && !li.querySelector(':scope > ul.dropdown-menu')) li.appendChild(document.importNode(sub, true));
    });
    return (new Function('return ' + fn)())(null, avatar, ids, header);
  }, [cleanInPage.toString(), AVATAR, ids]);
  const footer = await page.evaluate(([fn, avatar]) => (new Function('return ' + fn)())('#footer', avatar, []), [cleanInPage.toString(), AVATAR]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'header.html'), stamp + header + '\n');
  fs.writeFileSync(path.join(OUT, 'footer.html'), stamp + footer + '\n');
  fs.writeFileSync(path.join(OUT, 'styles.page-statique.html'), stamp + await page.evaluate(stylesAfterCustomInPage) + '\n');
  // Menu du site en YAML (même format que custom-af-content/menus.yaml), lu dans le menu bureau de l'en-tête capturé
  const menu = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const read = ul => [...ul.children].filter(li => li.tagName === 'LI').map(li => {
      const a = li.querySelector(':scope > a');
      const item = { titre: a.textContent.trim(), lien: a.getAttribute('href') };
      const sub = li.querySelector(':scope > ul.dropdown-menu');
      if (sub) item['sous-menu'] = read(sub);
      return item;
    });
    return read(doc.querySelector('ul.nav:not(.nav-mobile)'));
  }, header);
  fs.mkdirSync(PROD, { recursive: true });
  fs.writeFileSync(path.join(PROD, 'custom.css'), await page.evaluate(async () => (await fetch('/site/css/show')).text()));
  fs.writeFileSync(path.join(PROD, 'menus.yaml'),
    '# Menu de reso.co (vue membre), capturé le ' + new Date().toISOString().slice(0, 10) +
    ' par tools/capture-site-chrome.js — ne pas modifier à la main.\n' +
    '# Pour essayer un autre menu dans l\'aperçu, modifier custom-af-content/menus.yaml (même format).\n' + toYaml(menu));
  console.log('En-tête et pied de page capturés (menu visiteurs retiré : ' + Object.values(VISITOR_ONLY_MENU).join(', ') + ')');
  await ctx.close();

  // 2. Widgets du tableau de bord, à chaque largeur
  const widgetsDir = path.join(OUT, 'widgets');
  fs.rmSync(widgetsDir, { recursive: true, force: true });
  fs.mkdirSync(widgetsDir, { recursive: true });
  let order = null;
  for (const [bp, width] of Object.entries(WIDTHS)) {
    ctx = await newContext(browser, cookies, width);
    page = await ctx.newPage();
    await page.goto(ORIGIN + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-tag-id="instance-layout-user-dashboard"] [data-tag-id="draggable"] > .is-draggable', { timeout: 30000 });
    const pending = await loadLazyImages(page);
    if (pending) console.warn('  ' + bp + ' : ' + pending + ' image(s) pas encore chargée(s)');

    const found = await page.evaluate(([fn, avatar]) => {
      const clean = new Function('return ' + fn)();
      const dash = document.querySelector('[data-tag-id="instance-layout-user-dashboard"]');
      const slider = dash.querySelector('[data-tag-id="instance-layout-widget-slider"]');
      const items = [...dash.querySelectorAll('[data-tag-id="draggable"] > .is-draggable')].map(item => {
        const w = item.firstElementChild;
        const type = w.getAttribute('data-tag-id');
        const titleEl = w.querySelector('.common-card-generic-title');
        // Titre sans l'emoji qui le précède (span.common-emoji)
        let title = null;
        if (titleEl) {
          const t = titleEl.cloneNode(true);
          t.querySelectorAll('.common-emoji').forEach(e => e.remove());
          title = t.textContent.replace(/\s+/g, ' ').trim();
        }
        if (type === 'instance-layout-widget-html-content') {
          // contenu du widget « html libre », tel qu'il a été collé dans AlumnForce
          const r = w.querySelector('.richedit_wrap');
          return { type, title, html: null, content: r ? r.innerHTML.trim() : '' };
        }
        return { type, title, html: clean(null, avatar, [], w) };
      });
      return { slider: slider ? clean(null, avatar, [], slider) : null, items };
    }, [cleanInPage.toString(), AVATAR]);

    if (bp === 'bureau') fs.writeFileSync(path.join(OUT, 'styles.accueil.html'), stamp + await page.evaluate(stylesAfterCustomInPage) + '\n');
    if (found.slider) fs.writeFileSync(path.join(widgetsDir, 'slider.' + bp + '.html'), stamp + found.slider + '\n');
    // Même vocabulaire que custom-af-content/accueil.yaml : { widget: <nom> } ou { html: <rang> }
    let htmlCount = 0;
    const thisOrder = (found.slider ? [{ widget: 'slider' }] : []).concat(found.items.map(it => {
      if (!it.html) {
        ++htmlCount;
        if (bp === 'bureau') fs.writeFileSync(path.join(PROD, 'html-widget' + htmlCount + '.html'), it.content + '\n');
        return { html: 'widget « html libre » n° ' + htmlCount };
      }
      const slug = slugify(it.title || it.type);
      fs.writeFileSync(path.join(widgetsDir, slug + '.' + bp + '.html'), stamp + it.html + '\n');
      return { widget: slug, titre: it.title };
    }));
    order = order || thisOrder;
    console.log('Widgets ' + bp + ' (' + width + ' px) : ' + thisOrder.map(o => o.widget || o.html).join(', '));
    await ctx.close();
  }
  // Accueil actuel, au format de custom-af-content/accueil.yaml
  let n = 0;
  fs.writeFileSync(path.join(PROD, 'accueil.yaml'),
    '# Accueil des membres tel qu\'il est sur reso.co, capturé le ' + new Date().toISOString().slice(0, 10) +
    ' par tools/capture-site-chrome.js — ne pas modifier à la main.\n' +
    order.map(o => o.widget ? '- widget: ' + o.widget + '\n' : '- html: html-widget' + (++n) + '.html\n').join(''));
  fs.writeFileSync(path.join(widgetsDir, 'widgets.json'), JSON.stringify({
    capture: new Date().toISOString().slice(0, 10),
    largeurs: WIDTHS,
    ordreSurLeSite: order
  }, null, 2) + '\n');
  await browser.close();
})();
