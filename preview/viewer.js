// Visionneuse : affiche une page de preview/pages.yaml via preview.html, dans une version
// (Proposition, Brouillon ou Production) et avec les choix de preview/choix.yaml.
// On passe d'une page à l'autre par le menu déroulant ou par le vrai menu de la page affichée
// (voir « Navigation » dans preview.js).
// Tout l'état est dans l'adresse (#page=…&w=…&v=…&choix=…) pour pouvoir partager un lien.
(function () {
  'use strict';

  var TYPES = { 'page-statique': 'Page statique', 'accueil': 'Accueil (widgets)' };
  var VERSIONS = [
    { id: 'proposition', titre: 'Proposition', detail: 'custom-af-content/, avec les choix ci-dessous' },
    { id: 'brouillon', titre: 'Brouillon', detail: 'la Proposition avec vos modifications (✎ Éditer), gardées dans ce navigateur' },
    { id: 'production', titre: 'Production', detail: 'ce qui est en ligne sur reso.co (capture)' }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var pages = [], questions = [];
  var state = { page: null, w: 1366, panel: true, v: 'proposition', c: {} };

  // ---------- État <-> adresse ----------
  // Les choix s'écrivent « palette:charte.sous-menus:pastel » (réponses par défaut omises).
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.page = h.get('page') || (pages[0] && pages[0].id);
    state.w = parseInt(h.get('w'), 10) || 1366;
    state.v = ['production', 'brouillon'].indexOf(h.get('v')) >= 0 ? h.get('v') : 'proposition';
    state.c = {};
    (h.get('choix') || '').split('.').forEach(function (p) {
      var i = p.indexOf(':');
      if (i > 0) state.c[p.slice(0, i)] = p.slice(i + 1);
    });
  }
  function nonDefault() {
    return questions.filter(function (q) { return selected(q) !== q.options[0].id; });
  }
  function writeHash() {
    var h = new URLSearchParams({ page: state.page, w: state.w });
    if (state.v !== 'proposition') h.set('v', state.v);
    var c = nonDefault().map(function (q) { return q.id + ':' + selected(q); });
    if (c.length) h.set('choix', c.join('.'));
    history.replaceState(null, '', '#' + h.toString());
  }

  // ---------- Choix ----------
  function selected(q) {
    var id = state.c[q.id];
    return (q.options || []).some(function (o) { return o.id === id; }) ? id : q.options[0].id;
  }
  function optionTitle(q, id) {
    var o = (q.options || []).find(function (x) { return x.id === id; });
    return o ? o.titre : id;
  }
  // « Proposition · Palette 2, Cartes arrondies… » : ce qui distingue l'aperçu des choix par défaut
  function label() {
    if (state.v === 'production') return 'Production (en ligne)';
    var diff = nonDefault().map(function (q) { return optionTitle(q, selected(q)); });
    return (state.v === 'brouillon' ? 'Brouillon' : 'Proposition') + (diff.length ? ' · ' + diff.join(', ') : '');
  }
  function summary() {
    if (state.v === 'production') return 'Production : la version en ligne.';
    return (state.v === 'brouillon' ? '(Brouillon : modifications faites dans l\'éditeur, non publiées)\n' : '') +
      questions.map(function (q) { return '- ' + q.question + ' : ' + optionTitle(q, selected(q)); }).join('\n');
  }

  function renderChoices() {
    var box = $('choices');
    box.replaceChildren();
    var production = state.v === 'production';

    function block(title, rows) {
      var fs = document.createElement('fieldset');
      fs.className = 'choice';
      var lg = document.createElement('legend');
      lg.textContent = title;
      fs.appendChild(lg);
      rows.forEach(function (r) { fs.appendChild(r); });
      return fs;
    }
    function row(name, value, checked, disabled, text, detail, colors, onPick) {
      var lab = document.createElement('label');
      lab.className = 'choice-row' + (disabled ? ' disabled' : '');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = checked;
      input.disabled = disabled;
      input.addEventListener('change', onPick);
      lab.appendChild(input);
      var txt = document.createElement('span');
      txt.className = 'choice-text';
      var t = document.createElement('span');
      t.textContent = text;
      txt.appendChild(t);
      if (colors) {
        var sw = document.createElement('span');
        sw.className = 'swatches';
        colors.forEach(function (c) { var i = document.createElement('i'); i.style.background = c; sw.appendChild(i); });
        txt.appendChild(sw);
      }
      if (detail) {
        var d = document.createElement('small');
        d.textContent = detail;
        txt.appendChild(d);
      }
      lab.appendChild(txt);
      return lab;
    }

    box.appendChild(block('Version', VERSIONS.map(function (v) {
      return row('version', v.id, state.v === v.id, false, v.titre, v.detail, null,
        function () { state.v = v.id; update(); });
    })));
    if (production) {
      var note = document.createElement('p');
      note.className = 'hint choice-note';
      note.textContent = 'Les choix ci-dessous ne s\'appliquent pas à la Production.';
      box.appendChild(note);
    }
    var groupe = null;
    questions.forEach(function (q) {
      if (q.groupe && q.groupe !== groupe) {   // titre de groupe (clé « groupe » dans choix.yaml)
        groupe = q.groupe;
        var h = document.createElement('h3');
        h.className = 'choice-group';
        h.textContent = groupe;
        box.appendChild(h);
      }
      box.appendChild(block(q.question, (q.options || []).map(function (o) {
        return row(q.id, o.id, selected(q) === o.id, production, o.titre, o.detail, o.couleurs,
          function () { state.c[q.id] = o.id; update(); });
      })));
    });
  }

  // ---------- Aperçu ----------
  function previewUrl() {
    var q = new URLSearchParams({ page: state.page });
    if (state.v !== 'proposition') q.set('version', state.v);
    if (state.v !== 'production') {
      var c = nonDefault().map(function (x) { return x.id + ':' + selected(x); });
      if (c.length) q.set('choix', c.join(','));
    }
    return 'preview.html?' + q.toString();
  }

  // L'iframe n'est rechargée que si son adresse change.
  function renderPane() {
    var pane = stage.firstElementChild;
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'pane';
      pane.innerHTML = '<div class="pane-label"><span></span><a target="_blank" title="Ouvrir cet aperçu seul">↗</a></div>' +
        '<div class="frame-box"><iframe title="Aperçu"></iframe></div>';
      stage.appendChild(pane);
    }
    var src = previewUrl();
    pane.querySelector('.pane-label span').textContent = label();
    pane.querySelector('.pane-label a').href = src;
    var frame = pane.querySelector('iframe');
    if (frame.getAttribute('src') !== src) {
      warnings = [];
      frame.setAttribute('src', src);
    }
    fit();
  }

  function fit() {
    var pane = stage.firstElementChild;
    if (!pane) return;
    var pad = window.innerWidth <= 720 ? 8 : 16;
    var lab = pane.querySelector('.pane-label');
    var availW = stage.clientWidth - 2 * pad;
    var availH = stage.clientHeight - 2 * pad - lab.offsetHeight - 6;
    var scale = Math.min(1, availW / state.w);
    var box = pane.querySelector('.frame-box'), frame = pane.querySelector('iframe');
    pane.style.width = Math.floor(availW) + 'px';
    box.style.width = Math.floor(state.w * scale) + 'px';
    box.style.height = availH + 'px';
    frame.style.width = state.w + 'px';
    frame.style.height = Math.ceil(availH / scale) + 'px';
    frame.style.transform = 'scale(' + scale + ')';
  }

  // ---------- Avertissements et navigation (messages de preview.js) ----------
  var warnings = [];
  function showWarnings() {
    var box = $('warnings');
    if (!warnings.length) { box.hidden = true; return; }
    var ul = document.createElement('ul');
    warnings.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    box.replaceChildren(ul);
    box.hidden = false;
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'reso-preview' || d.page !== state.page) return;
    if (d.navigate) {   // lien vers une autre page de l'aperçu (logo, Timer…)
      if (pages.some(function (p) { return p.id === d.navigate; })) { state.page = d.navigate; update(); }
      return;
    }
    warnings = d.error ? [d.error] : (d.warnings || []);
    showWarnings();
  });

  // ---------- Éditeur (preview/editor.js) ----------
  // Brouillon modifié : l'aperçu en version Brouillon se recharge.
  window.addEventListener('brouillon-change', function () {
    var f = stage.querySelector('iframe');
    if (state.v === 'brouillon' && f && f.contentWindow) f.contentWindow.postMessage({ source: 'reso-viewer', type: 'brouillon' }, '*');
  });
  // À l'ouverture de l'éditeur, l'aperçu montre le brouillon (s'il montrait la Proposition).
  window.addEventListener('editor-open', function () {
    if (state.v === 'proposition') { state.v = 'brouillon'; update(); }
  });
  window.addEventListener('viewer-toast', function (e) { toast(e.detail); });

  // ---------- Copie ----------
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function copyText(text, what) {
    return navigator.clipboard.writeText(text)
      .then(function () { toast(what + ' copié dans le presse-papier'); })
      .catch(function () { toast('Copie impossible'); });
  }

  // ---------- Rendu général ----------
  function update() {
    var entry = pages.find(function (p) { return p.id === state.page; }) || pages[0];
    if (!entry) return;
    state.page = entry.id;
    writeHash();
    document.querySelectorAll('#widths button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.w, 10) === state.w));
    });
    $('toggle-panel').setAttribute('aria-pressed', String(state.panel));
    document.body.classList.toggle('panel-closed', !state.panel);
    $('page-select').value = entry.id;
    $('page-type').textContent = TYPES[entry.type] || entry.type;
    $('open-live').href = entry.url || 'https://www.reso.co/';
    document.title = entry.titre + ' · Pages Reso';
    window.dispatchEvent(new CustomEvent('viewer-page', { detail: entry.id }));
    renderChoices();
    renderPane();
    showWarnings();
  }

  $('widths').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.w = parseInt(b.dataset.w, 10);
    update();
  });
  $('toggle-panel').addEventListener('click', function () { state.panel = !state.panel; update(); });
  $('reset').addEventListener('click', function () { state.v = 'proposition'; state.c = {}; update(); });
  $('copy-link').addEventListener('click', function () { copyText(location.href, 'Lien'); });
  $('copy-summary').addEventListener('click', function () { copyText(summary() + '\n\n' + location.href, 'Résumé'); });
  window.addEventListener('hashchange', function () { readHash(); update(); });
  new ResizeObserver(fit).observe(stage);

  Promise.all([
    fetch('preview/pages.yaml', { cache: 'no-store' }).then(function (r) { return r.text(); }),
    fetch('preview/choix.yaml', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : '[]'; })
  ]).then(function (r) {
    pages = window.jsyaml.load(r[0]) || [];
    questions = (window.jsyaml.load(r[1]) || []).filter(function (q) { return q && q.id && q.options && q.options.length; });
    // Menu déroulant des pages (preview/pages.yaml) ; on peut aussi changer de page par le menu du site
    var select = $('page-select');
    pages.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.titre;
      select.appendChild(o);
    });
    select.addEventListener('change', function () { state.page = select.value; update(); });
    readHash();
    update();
  }).catch(function (e) {
    warnings = ['preview/pages.yaml ou preview/choix.yaml illisible : ' + e.message];
    showWarnings();
  });
})();
