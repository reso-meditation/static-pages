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
  var captures = {};                      // 'slider.mobile' → HTML capturé
  var last = { css: null, key: null };    // dernier rendu (pour ne reconstruire que si besoin)

  // Classes générées par Vue pour le tableau de bord, relevées sur reso.co (breakpoints Vuetify 600 / 960 px).
  // `nom` désigne aussi la variante des widgets capturés (preview/site/widgets/<widget>.<nom>.html).
  var BREAKPOINTS = [
    { nom: 'bureau', min: 960, dashboard: 'container py-8', row: 'row', col: 'col col-9' },
    { nom: 'tablette', min: 600, dashboard: 'container', row: 'row', col: 'col col-12' },
    { nom: 'mobile', min: 0, dashboard: '', row: 'row no-gutters', col: 'col col-12' }
  ];
  function currentBreakpoint() {
    var w = window.innerWidth;
    return BREAKPOINTS.find(function (b) { return w >= b.min; });
  }

  // Les chemins absolus (/medias/...) pointent vers reso.co, comme sur le site.
  function absolutize(text) {
    return text
      .replace(/(\s(?:src|href|poster|data-src|action)\s*=\s*["'])\/(?!\/)/gi, '$1' + ORIGIN + '/')
      .replace(/(\ssrcset\s*=\s*["'])([^"']*)/gi, function (m, attr, value) {
        return attr + value.replace(/(^|,\s*)\/(?!\/)/g, '$1' + ORIGIN + '/');
      })
      .replace(/url\(\s*(["']?)\/(?!\/)/gi, 'url($1' + ORIGIN + '/')
      .replace(/url\(\s*&quot;\/(?!\/)/gi, 'url(&quot;' + ORIGIN + '/');
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

  function htmlNode(html) {
    var t = document.createElement('template');
    t.innerHTML = absolutize(html).replace(/^\s*<!--[\s\S]*?-->\s*/, '');
    return t.content;
  }

  // Fichiers HTML à nous (versionnés dans pages/) qui composent la page.
  function htmlFiles(entry) {
    if (entry.type === 'accueil') {
      return (entry.widgets || []).filter(function (w) { return w.html; }).map(function (w) { return w.html; });
    }
    return [entry.html || 'pages/' + entry.id + '.html'];
  }

  // Widgets capturés sur reso.co, pour la largeur courante (chargés une fois puis gardés).
  function loadCaptures(entry, bp) {
    if (entry.type !== 'accueil') return Promise.resolve();
    var names = (entry.widgets || []).filter(function (w) { return w.capture; }).map(function (w) { return w.capture; });
    if (entry.slider) names.unshift('slider');
    return Promise.all(names.map(function (name) {
      var key = name + '.' + bp.nom;
      if (captures[key] !== undefined) return null;
      return fetchText('preview/site/widgets/' + key + '.html')
        .then(function (t) { captures[key] = t; })
        .catch(function () { captures[key] = null; });
    }));
  }

  function renderStatic(entry, files) {
    var frag = document.getElementById('tpl-page-statique').content.cloneNode(true);
    frag.querySelector('[data-slot]').appendChild(htmlNode(files[htmlFiles(entry)[0]]));
    return frag;
  }

  function renderAccueil(entry, files, bp) {
    var frag = document.getElementById('tpl-accueil').content.cloneNode(true);
    frag.querySelectorAll('[data-bp]').forEach(function (el) { el.className = bp[el.dataset.bp]; });

    var sliderSlot = frag.querySelector('[data-slider]');
    var slider = entry.slider && captures['slider.' + bp.nom];
    if (slider) sliderSlot.replaceWith(htmlNode(slider)); else sliderSlot.remove();

    var list = frag.querySelector('[data-widgets]');
    (entry.widgets || []).forEach(function (w, i) {
      var item = document.createElement('div');
      item.className = i === 0 ? 'is-draggable' : 'mt-6 is-draggable';
      if (w.html) {
        var widget = document.getElementById('tpl-widget-html').content.cloneNode(true);
        widget.querySelector('[data-slot]').appendChild(htmlNode(files[w.html]));
        item.appendChild(widget);
      } else {
        var html = captures[w.capture + '.' + bp.nom];
        if (html) item.appendChild(htmlNode(html));
        else item.innerHTML = '<p style="padding:1em;color:#9f1557">Widget « ' + w.capture + ' » non capturé (' + bp.nom + ').</p>';
      }
      list.appendChild(item);
    });
    return frag;
  }

  function render(entry, css, files) {
    if (css !== last.css) {
      customCss.textContent = absolutize(css);
      last.css = css;
      syncScrollableNav();
    }
    var bp = currentBreakpoint();
    var key = bp.nom + '\u0000' + htmlFiles(entry).map(function (f) { return files[f]; }).join('\u0000');
    if (key === last.key) return;
    last.key = key;

    var y = window.scrollY;
    main.replaceChildren(entry.type === 'accueil' ? renderAccueil(entry, files, bp) : renderStatic(entry, files));
    window.scrollTo(0, y);

    var warnings = [];
    htmlFiles(entry).forEach(function (f) {
      lint(files[f], entry.type).forEach(function (w) { warnings.push(f + ' : ' + w); });
    });
    notify({ warnings: warnings });
  }

  function load(entry) {
    var paths = htmlFiles(entry);
    return Promise.all([fetchText('custom.css'), Promise.all(paths.map(fetchText)), loadCaptures(entry, currentBreakpoint())])
      .then(function (r) {
        var files = {};
        paths.forEach(function (p, i) { files[p] = r[1][i]; });
        render(entry, r[0], files);
      });
  }

  // En-tête et pied de page de reso.co, capturés par tools/capture-site-chrome.js.
  // Sous 600 px, l'en-tête contient aussi la barre de navigation fixée en bas de l'écran.
  function loadSiteChrome() {
    return Promise.all([fetchText('preview/site/header.html'), fetchText('preview/site/footer.html')])
      .then(function (r) {
        main.parentNode.insertBefore(htmlNode(r[0]), main);
        main.parentNode.insertBefore(htmlNode(r[1]), main.nextSibling);
        initScrollableNav();
      })
      .catch(function (e) { console.warn('En-tête / pied de page indisponibles :', e.message); });
  }

  // Feuilles de style que Vue injecte après custom.css sur reso.co (thème Vuetify, styles des composants,
  // CSS chargés à la demande), capturées par tools/capture-site-chrome.js. Insérées au même endroit.
  function loadSiteStyles(entry) {
    return fetchText('preview/site/styles.' + entry.type + '.html')
      .then(function (html) { customCss.parentNode.insertBefore(htmlNode(html), customCss.nextSibling); })
      .catch(function (e) { console.warn('Styles Vue indisponibles :', e.message); });
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

  if (!pageId) return showError('Paramètre ?page= manquant.');

  fetch('pages/pages.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (pages) {
      var entry = pages.find(function (p) { return p.id === pageId; });
      if (!entry) throw new Error('Page « ' + pageId + ' » absente de pages/pages.json.');
      if (!document.getElementById('tpl-' + entry.type)) throw new Error('Type de page inconnu dans pages.json : « ' + entry.type + ' » (attendu : page-statique ou accueil).');
      document.title = entry.titre + ' · aperçu Reso';
      // Changement de breakpoint (la visionneuse change la largeur) : autres captures, autres classes Vue.
      var bpName = currentBreakpoint().nom;
      window.addEventListener('resize', function () {
        if (currentBreakpoint().nom === bpName) return;
        bpName = currentBreakpoint().nom;
        load(entry).catch(function (e) { showError(e.message); });
      });
      return Promise.all([loadSiteStyles(entry), loadSiteChrome(), load(entry)]).then(function () {
        // En local : rechargement automatique quand custom.css ou une page change.
        if (isLocal) setInterval(function () { load(entry).catch(function () {}); }, 1500);
      });
    })
    .catch(function (e) { showError(e.message); });
})();
