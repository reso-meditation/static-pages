// Visionneuse : liste les pages de pages/pages.json et les affiche via preview.html.
// L'état (page, largeur) est dans l'URL (#page=…&w=…) pour pouvoir partager un lien.
(function () {
  'use strict';

  var TYPES = { 'page-statique': 'Page statique', 'accueil': 'Accueil (widget html libre)' };
  var $ = function (id) { return document.getElementById(id); };
  var frame = $('frame'), box = $('frame-box'), stage = $('stage');
  var pages = [];
  var state = { page: null, w: 1366 };

  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.page = h.get('page') || (pages[0] && pages[0].id);
    state.w = parseInt(h.get('w'), 10) || 1366;
  }

  function writeHash() {
    var h = new URLSearchParams({ page: state.page, w: state.w });
    history.replaceState(null, '', '#' + h.toString());
  }

  function previewUrl() {
    return 'preview.html?page=' + encodeURIComponent(state.page);
  }

  function fit() {
    var availW = stage.clientWidth - 32, availH = stage.clientHeight - 32;
    if (window.innerWidth <= 720) { availW = stage.clientWidth - 16; availH = stage.clientHeight - 16; }
    var scale = Math.min(1, availW / state.w);
    box.style.width = Math.floor(state.w * scale) + 'px';
    box.style.height = availH + 'px';
    frame.style.width = state.w + 'px';
    frame.style.height = Math.ceil(availH / scale) + 'px';
    frame.style.transform = 'scale(' + scale + ')';
  }

  function render() {
    var entry = pages.find(function (p) { return p.id === state.page; }) || pages[0];
    if (!entry) return;
    state.page = entry.id;
    writeHash();

    document.querySelectorAll('#page-list a').forEach(function (a) {
      if (a.dataset.id === entry.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('#widths button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.w, 10) === state.w));
    });
    $('page-title').textContent = entry.titre;
    $('page-type').textContent = TYPES[entry.type] || entry.type;
    $('open-alone').href = previewUrl();
    $('open-live').href = entry.url || 'https://www.reso.co/';
    document.title = entry.titre + ' · Pages Reso';

    var src = previewUrl();
    if (frame.getAttribute('src') !== src) {
      $('warnings').hidden = true;
      frame.setAttribute('src', src);
    }
    fit();
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function copyFile(path, label) {
    fetch(path, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (text) { return navigator.clipboard.writeText(text); })
      .then(function () { toast(label + ' copié dans le presse-papier'); })
      .catch(function () { toast('Copie impossible : ouvrez le fichier ' + path); });
  }

  // Avertissements envoyés par preview.js (JavaScript, iframe sur l'accueil…)
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'reso-preview' || d.page !== state.page) return;
    var box = $('warnings');
    var items = d.error ? [d.error] : (d.warnings || []);
    if (!items.length) { box.hidden = true; return; }
    var ul = document.createElement('ul');
    items.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    box.replaceChildren(ul);
    box.hidden = false;
  });

  $('widths').addEventListener('click', function (e) {
    var w = e.target.closest('button');
    if (!w) return;
    state.w = parseInt(w.dataset.w, 10);
    render();
  });
  $('copy-html').addEventListener('click', function () { copyFile('pages/' + state.page + '.html', 'HTML'); });
  $('copy-css').addEventListener('click', function () { copyFile('custom.css', 'custom.css'); });
  window.addEventListener('hashchange', function () { readHash(); render(); });
  new ResizeObserver(fit).observe(stage);

  fetch('pages/pages.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (list) {
      pages = list;
      var ul = $('page-list');
      list.forEach(function (p) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#page=' + encodeURIComponent(p.id);
        a.dataset.id = p.id;
        a.textContent = p.titre;
        var small = document.createElement('small');
        small.textContent = 'pages/' + p.id + '.html';
        a.appendChild(small);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          state.page = p.id;
          render();
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      readHash();
      render();
    })
    .catch(function () {
      $('page-title').textContent = 'pages/pages.json introuvable';
    });
})();
