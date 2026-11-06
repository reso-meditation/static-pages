// Rendu d'une page dans le contexte reso.co. Ce script ne fait partie que de l'outil
// d'aperçu : les fragments de pages/ eux-mêmes ne doivent contenir aucun JavaScript.
(function () {
  'use strict';

  var ORIGIN = 'https://www.reso.co';
  var params = new URLSearchParams(location.search);
  var pageId = params.get('page');
  var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);

  var main = document.getElementById('main-content');
  var customCss = document.getElementById('custom-css');
  var last = { css: null, html: null };


  // Les chemins absolus (/medias/...) pointent vers reso.co, comme sur le site.
  function absolutize(text) {
    return text
      .replace(/(\s(?:src|href|poster|data-src|action)\s*=\s*["'])\/(?!\/)/gi, '$1' + ORIGIN + '/')
      .replace(/(\ssrcset\s*=\s*["'])([^"']*)/gi, function (m, attr, value) {
        return attr + value.replace(/(^|,\s*)\/(?!\/)/g, '$1' + ORIGIN + '/');
      })
      .replace(/url\(\s*(["']?)\/(?!\/)/gi, 'url($1' + ORIGIN + '/');
  }

  // Ce qu'AlumnForce refuse ou supprime : on le signale à la visionneuse.
  function lint(html, type) {
    var warnings = [];
    if (/<script\b/i.test(html)) warnings.push('Balise <script> : AlumnForce n\'exécute pas de JavaScript.');
    if (/\son[a-z]+\s*=/i.test(html)) warnings.push('Attribut on… (onclick, onload…) : JavaScript interdit.');
    if (/javascript:/i.test(html)) warnings.push('Lien javascript: : JavaScript interdit.');
    if (/<style\b/i.test(html)) warnings.push('Balise <style> : à déplacer dans custom.css (l\'éditeur risque de la supprimer).');
    if (type === 'accueil' && /<iframe\b/i.test(html)) warnings.push('<iframe> sur la page d\'accueil : a priori non autorisé par AlumnForce.');
    return warnings;
  }

  // Classes générées par Vue pour le tableau de bord, relevées sur reso.co (breakpoints Vuetify 600 / 960 px).
  var BREAKPOINTS = [
    { min: 960, dashboard: 'container py-8', row: 'row', col: 'col col-9' },
    { min: 600, dashboard: 'container', row: 'row', col: 'col col-12' },
    { min: 0, dashboard: '', row: 'row no-gutters', col: 'col col-12' }
  ];
  function applyBreakpoint() {
    var w = window.innerWidth;
    var bp = BREAKPOINTS.find(function (b) { return w >= b.min; });
    document.querySelectorAll('[data-bp]').forEach(function (el) { el.className = bp[el.dataset.bp]; });
  }
  window.addEventListener('resize', applyBreakpoint);

  function notify(payload) {
    if (window.parent !== window) window.parent.postMessage(Object.assign({ source: 'reso-preview', page: pageId }, payload), '*');
  }

  function fetchText(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' : HTTP ' + r.status);
      return r.text();
    });
  }

  function showError(message) {
    main.innerHTML = '<div style="padding:2em;font-family:sans-serif;color:#9f1557"></div>';
    main.firstChild.textContent = message;
    notify({ error: message });
  }

  function render(entry, css, html) {
    if (css !== last.css) {
      customCss.textContent = absolutize(css);
      syncScrollableNav();
    }
    if (html !== last.html) {
      var tpl = document.getElementById('tpl-' + entry.type);
      if (!tpl) return showError('Type de page inconnu dans pages.json : « ' + entry.type + ' » (attendu : page-statique ou accueil).');
      var y = window.scrollY;
      var frag = tpl.content.cloneNode(true);
      frag.querySelector('[data-slot]').innerHTML = absolutize(html);
      main.replaceChildren(frag);
      applyBreakpoint();
      window.scrollTo(0, y);
      notify({ warnings: lint(html, entry.type) });
    }
    last.css = css;
    last.html = html;
  }

  // En-tête et pied de page de reso.co, capturés par tools/capture-site-chrome.js.
  // Sous 600 px, l'en-tête contient aussi la barre de navigation fixée en bas de l'écran.
  function loadSiteChrome() {
    return Promise.all([fetchText('preview/site/header.html'), fetchText('preview/site/footer.html')])
      .then(function (r) {
        main.insertAdjacentHTML('beforebegin', absolutize(r[0]));
        main.insertAdjacentHTML('afterend', absolutize(r[1]));
        initScrollableNav();
      })
      .catch(function (e) { console.warn('En-tête / pied de page indisponibles :', e.message); });
  }

  // Imite le script AlumnForce du menu bureau : les flèches ‹ › n'apparaissent que si le menu
  // déborde (classes figées dans la capture, recalculées ici, par ex. après un changement de custom.css).
  function syncScrollableNav() {
    document.querySelectorAll('#header .js-scrollable-nav').forEach(function (nav) {
      var ul = nav.querySelector('ul.nav');
      if (!ul) return;
      var prev = nav.querySelector('.js-scrollable-nav--button--prev');
      var next = nav.querySelector('.js-scrollable-nav--button--next');
      if (prev) prev.classList.toggle('js-scrollable-nav--button-active', ul.scrollLeft > 0);
      if (next) next.classList.toggle('js-scrollable-nav--button-active', ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 1);
    });
  }
  function initScrollableNav() {
    document.querySelectorAll('#header .js-scrollable-nav').forEach(function (nav) {
      var ul = nav.querySelector('ul.nav');
      if (!ul) return;
      nav.querySelectorAll('.js-scrollable-nav--button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = btn.classList.contains('js-scrollable-nav--button--prev') ? -1 : 1;
          ul.scrollBy({ left: dir * ul.clientWidth * 0.8, behavior: 'smooth' });
        });
      });
      ul.addEventListener('scroll', syncScrollableNav);
    });
    window.addEventListener('resize', syncScrollableNav);
    syncScrollableNav();
    if (document.fonts) document.fonts.ready.then(syncScrollableNav);
  }

  function load(entry) {
    return Promise.all([fetchText('custom.css'), fetchText('pages/' + entry.id + '.html')])
      .then(function (r) { render(entry, r[0], r[1]); });
  }

  if (!pageId) return showError('Paramètre ?page= manquant.');

  fetch('pages/pages.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (pages) {
      var entry = pages.find(function (p) { return p.id === pageId; });
      if (!entry) throw new Error('Page « ' + pageId + ' » absente de pages/pages.json.');
      document.title = entry.titre + ' · aperçu Reso';
      return Promise.all([loadSiteChrome(), load(entry)]).then(function () {
        // En local : rechargement automatique quand custom.css ou la page change.
        if (isLocal) setInterval(function () { load(entry).catch(function () {}); }, 1500);
      });
    })
    .catch(function (e) { showError(e.message); });
})();
