// Capture l'en-tête et le pied de page de reso.co (vue membre connecté) pour l'aperçu.
// Écrit preview/site/header.html et preview/site/footer.html, nettoyés :
// sans scripts, sans attributs Vue/JS, et sans la photo de profil du compte utilisé.
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
const AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#d9d6cf"/>' +
  '<circle cx="20" cy="15" r="7" fill="#fff"/><path d="M6 38c2-9 8-13 14-13s12 4 14 13z" fill="#fff"/></svg>');

(async () => {
  const raw = process.env.RESO_COOKIE;
  if (!raw) { console.error('Variable RESO_COOKIE manquante (cookies de session reso.co).'); process.exit(1); }
  const cookies = raw.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf('=');
    return { name: s.slice(0, i), value: s.slice(i + 1), domain: 'www.reso.co', path: '/' };
  });

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/page/minuteur', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  if (!(await page.$('#header .af-userbar-menubar-elements, #header a[href*="logout"]'))) {
    console.error('La page ne semble pas connectée : vérifiez RESO_COOKIE.');
    await browser.close();
    process.exit(1);
  }

  const parts = await page.evaluate((avatar) => {
    function clean(el) {
      const c = el.cloneNode(true);
      c.querySelectorAll('script, noscript, template, iframe, link, style').forEach(n => n.remove());
      // Résultats de recherche et fenêtres modales : invisibles et volumineux
      c.querySelectorAll('[id^="fullsearch-toolbar-results"], .modal').forEach(n => n.remove());
      c.querySelectorAll('img[src*="/medias/profile/"]').forEach(img => { img.src = avatar; img.removeAttribute('srcset'); });
      c.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => {
          if (/^(on|@|:|v-on|v-bind|data-v-)/.test(a.name)) n.removeAttribute(a.name);
        });
      });
      return c.outerHTML.replace(/\n\s*\n+/g, '\n');
    }
    return { header: clean(document.querySelector('#header')), footer: clean(document.querySelector('#footer')) };
  }, AVATAR);

  fs.mkdirSync(OUT, { recursive: true });
  const stamp = '<!-- Capturé sur ' + ORIGIN + ' le ' + new Date().toISOString().slice(0, 10) + ' par tools/capture-site-chrome.js — ne pas modifier à la main -->\n';
  fs.writeFileSync(path.join(OUT, 'header.html'), stamp + parts.header + '\n');
  fs.writeFileSync(path.join(OUT, 'footer.html'), stamp + parts.footer + '\n');
  console.log('OK : preview/site/header.html (' + parts.header.length + ' o), preview/site/footer.html (' + parts.footer.length + ' o)');
  await browser.close();
})();
