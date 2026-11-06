// Visionneuse : affiche les pages de preview/pages.yaml via preview.html, avec deux réglages A et B
// On passe d'une page à l'autre par le vrai menu de la page affichée (voir « Navigation » dans preview.js).
// (version Proposition/Production + choix de preview/choix.yaml), seuls ou côte à côte.
// Tout l'état est dans l'adresse (#page=…&w=…&cmp=1&a=…&b=…) pour pouvoir partager un lien.
(function () {
  'use strict';

  var CONTENT = 'custom-af-content/';
  var TYPES = { 'page-statique': 'Page statique', 'accueil': 'Accueil (widgets)' };
  var VERSIONS = [
    { id: 'proposition', titre: 'Proposition', detail: 'custom-af-content/, avec les choix ci-dessous' },
    { id: 'production', titre: 'Production', detail: 'ce qui est en ligne sur reso.co (capture)' }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var pages = [], questions = [];
  var state = {
    page: null, w: 1366, cmp: false, panel: true,
    a: { v: 'proposition', c: {} },
    b: { v: 'production', c: {} }
  };

  // ---------- État <-> adresse ----------
  // Un réglage s'écrit « proposition~palette:charte.fonds:aucune » (choix par défaut omis).
  function encodeSide(s) {
    var c = Object.keys(s.c).filter(function (q) { return s.c[q] !== defaultOption(q); })
      .map(function (q) { return q + ':' + s.c[q]; });
    return s.v + (c.length ? '~' + c.join('.') : '');
  }
  function decodeSide(str, fallback) {
    if (!str) return fallback;
    var parts = str.split('~');
    var side = { v: parts[0] === 'production' ? 'production' : 'proposition', c: {} };
    (parts[1] || '').split('.').forEach(function (p) {
      var i = p.indexOf(':');
      if (i > 0) side.c[p.slice(0, i)] = p.slice(i + 1);
    });
    return side;
  }
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.page = h.get('page') || (pages[0] && pages[0].id);
    state.w = parseInt(h.get('w'), 10) || 1366;
    state.cmp = h.get('cmp') === '1';
    state.a = decodeSide(h.get('a'), { v: 'proposition', c: {} });
    state.b = decodeSide(h.get('b'), { v: 'production', c: {} });
  }
  function writeHash() {
    var h = new URLSearchParams({ page: state.page, w: state.w });
    if (state.cmp) h.set('cmp', '1');
    h.set('a', encodeSide(state.a));
    h.set('b', encodeSide(state.b));
    history.replaceState(null, '', '#' + h.toString());
  }

  // ---------- Choix ----------
  function defaultOption(qid) {
    var q = questions.find(function (x) { return x.id === qid; });
    return q && q.options && q.options[0] ? q.options[0].id : null;
  }
  function selected(side, q) {
    var id = side.c[q.id];
    return (q.options || []).some(function (o) { return o.id === id; }) ? id : q.options[0].id;
  }
  function optionTitle(q, id) {
    var o = (q.options || []).find(function (x) { return x.id === id; });
    return o ? o.titre : id;
  }
  // « Proposition · Palette 2, Aucune bande » : ce qui distingue ce réglage des choix par défaut
  function sideLabel(side) {
    if (side.v === 'production') return 'Production (en ligne)';
    var diff = questions.filter(function (q) { return selected(side, q) !== q.options[0].id; })
      .map(function (q) { return optionTitle(q, selected(side, q)); });
    return 'Proposition' + (diff.length ? ' · ' + diff.join(', ') : '');
  }
  function summary(side) {
    if (side.v === 'production') return 'Production : la version en ligne.';
    return questions.map(function (q) { return '- ' + q.question + ' : ' + optionTitle(q, selected(side, q)); }).join('\n');
  }

  function renderChoices() {
    var box = $('choices');
    box.replaceChildren();
    var sides = state.cmp ? ['a', 'b'] : ['a'];
    $('panel-hint').textContent = state.cmp ? 'colonne A : à gauche, B : à droite' : '';

    function block(title, rows) {
      var fs = document.createElement('fieldset');
      fs.className = 'choice' + (state.cmp ? ' two' : '');
      var lg = document.createElement('legend');
      lg.textContent = title;
      fs.appendChild(lg);
      if (state.cmp) {
        var head = document.createElement('div');
        head.className = 'choice-head';
        head.innerHTML = '<span>A</span><span>B</span>';
        fs.appendChild(head);
      }
      rows.forEach(function (r) { fs.appendChild(r); });
      return fs;
    }
    function row(name, value, isChecked, isDisabled, label, detail, colors, onPick) {
      var lab = document.createElement('label');
      lab.className = 'choice-row';
      sides.forEach(function (sd) {
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = name + '-' + sd;
        input.value = value;
        input.checked = isChecked(sd);
        input.disabled = isDisabled(sd);
        if (state.cmp) input.setAttribute('aria-label', 'Réglage ' + sd.toUpperCase());
        input.addEventListener('change', function () { onPick(sd); });
        lab.appendChild(input);
      });
      var txt = document.createElement('span');
      txt.className = 'choice-text';
      var t = document.createElement('span');
      t.textContent = label;
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
      if (sides.every(isDisabled)) lab.classList.add('disabled');
      return lab;
    }

    box.appendChild(block('Version', VERSIONS.map(function (v) {
      return row('version', v.id, function (sd) { return state[sd].v === v.id; }, function () { return false; },
        v.titre, v.detail, null, function (sd) { state[sd].v = v.id; update(); });
    })));
    questions.forEach(function (q) {
      box.appendChild(block(q.question, (q.options || []).map(function (o, i) {
        return row(q.id, o.id, function (sd) { return selected(state[sd], q) === o.id; },
          function (sd) { return state[sd].v === 'production'; },
          o.titre + (i === 0 ? ' (proposition actuelle)' : ''), o.detail, o.couleurs,
          function (sd) { state[sd].c[q.id] = o.id; update(); });
      })));
    });
  }

  // ---------- Aperçus ----------
  function previewUrl(sd) {
    var s = state[sd];
    var q = new URLSearchParams({ page: state.page, cote: sd });
    if (s.v === 'production') q.set('version', 'production');
    else {
      var c = questions.filter(function (x) { return selected(s, x) !== x.options[0].id; })
        .map(function (x) { return x.id + ':' + selected(s, x); });
      if (c.length) q.set('choix', c.join(','));
    }
    return 'preview.html?' + q.toString();
  }

  // Un volet par réglage affiché ; une iframe n'est rechargée que si son adresse change.
  function renderPanes() {
    var sides = state.cmp ? ['a', 'b'] : ['a'];
    while (stage.children.length > sides.length) stage.lastChild.remove();
    sides.forEach(function (sd, i) {
      var pane = stage.children[i];
      if (!pane) {
        pane = document.createElement('div');
        pane.className = 'pane';
        pane.innerHTML = '<div class="pane-label"><span></span><a target="_blank" title="Ouvrir cet aperçu seul">↗</a></div>' +
          '<div class="frame-box"><iframe title="Aperçu"></iframe></div>';
        stage.appendChild(pane);
        pane.querySelector('iframe').addEventListener('load', function () { attachScrollSync(this); });
      }
      pane.dataset.side = sd;
      var src = previewUrl(sd);
      pane.querySelector('.pane-label span').textContent = (state.cmp ? sd.toUpperCase() + ' — ' : '') + sideLabel(state[sd]);
      pane.querySelector('.pane-label a').href = src;
      var frame = pane.querySelector('iframe');
      if (frame.getAttribute('src') !== src) {
        warnings[sd] = [];
        frame.setAttribute('src', src);
      }
    });
    fit();
  }

  function fit() {
    var panes = stage.querySelectorAll('.pane');
    if (!panes.length) return;
    var gap = 12, pad = window.innerWidth <= 720 ? 8 : 16;
    var availW = (stage.clientWidth - 2 * pad - gap * (panes.length - 1)) / panes.length;
    panes.forEach(function (pane) {
      var label = pane.querySelector('.pane-label');
      var availH = stage.clientHeight - 2 * pad - label.offsetHeight - 6;
      var scale = Math.min(1, availW / state.w);
      var box = pane.querySelector('.frame-box'), frame = pane.querySelector('iframe');
      pane.style.width = Math.floor(availW) + 'px';
      box.style.width = Math.floor(state.w * scale) + 'px';
      box.style.height = availH + 'px';
      frame.style.width = state.w + 'px';
      frame.style.height = Math.ceil(availH / scale) + 'px';
      frame.style.transform = 'scale(' + scale + ')';
    });
  }

  // Défilement synchronisé entre les deux volets, en proportion de la hauteur (les pages comparées
  // n'ont pas forcément la même hauteur).
  var syncing = false;
  function attachScrollSync(frame) {
    var win;
    try { win = frame.contentWindow; if (!win.document) return; } catch (e) { return; }
    win.addEventListener('scroll', function () {
      if (syncing || !state.cmp) return;
      var other = [].slice.call(stage.querySelectorAll('iframe')).find(function (f) { return f !== frame; });
      if (!other || !other.contentWindow) return;
      var d = win.document.documentElement, ow = other.contentWindow, od = ow.document.documentElement;
      var ratio = win.scrollY / Math.max(1, d.scrollHeight - win.innerHeight);
      syncing = true;
      ow.scrollTo(0, ratio * Math.max(0, od.scrollHeight - ow.innerHeight));
      requestAnimationFrame(function () { requestAnimationFrame(function () { syncing = false; }); });
    });
  }

  // ---------- Avertissements (envoyés par preview.js) ----------
  var warnings = { a: [], b: [] };
  function showWarnings() {
    var box = $('warnings');
    var items = warnings.a.map(function (w) { return (state.cmp ? 'A — ' : '') + w; });
    if (state.cmp) items = items.concat(warnings.b.map(function (w) { return 'B — ' + w; }));
    if (!items.length) { box.hidden = true; return; }
    var ul = document.createElement('ul');
    items.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    box.replaceChildren(ul);
    box.hidden = false;
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'reso-preview' || d.page !== state.page || !warnings[d.cote]) return;
    if (d.key === 'c') return toggleCompare();
    if (d.key === 'b') return swap();
    if (d.navigate) {   // lien vers une autre page de l'aperçu (logo, Timer…) : les deux volets suivent
      if (pages.some(function (p) { return p.id === d.navigate; })) { state.page = d.navigate; update(); }
      return;
    }
    warnings[d.cote] = d.error ? [d.error] : (d.warnings || []);
    showWarnings();
  });

  // ---------- Copie ----------
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function copyText(text, label) {
    return navigator.clipboard.writeText(text)
      .then(function () { toast(label + ' copié dans le presse-papier'); })
      .catch(function () { toast('Copie impossible'); });
  }
  function copyFile(path, label) {
    fetch(path, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (text) { return copyText(text, label); })
      .catch(function () { toast('Copie impossible : ouvrez le fichier ' + path); });
  }
  // Un bouton par fichier à coller : custom.css, puis le HTML de la page (un par widget « html libre »).
  function renderCopyButtons(entry) {
    var files = entry.type === 'accueil'
      ? fetch(CONTENT + entry.contenu, { cache: 'no-store' }).then(function (r) { return r.text(); })
          .then(function (t) {
            var list = window.jsyaml.load(t);
            return (Array.isArray(list) ? list : []).filter(function (w) { return w && w.html; })
              .map(function (w) { return { path: CONTENT + w.html, nom: w.html, titre: w.titre }; });
          })
          .catch(function () { return []; })
      : Promise.resolve([{ path: CONTENT + entry.contenu, nom: entry.contenu }]);
    files.then(function (list) {
      if (entry.id !== state.page) return;
      var box = $('copy-buttons');
      box.replaceChildren();
      [{ path: CONTENT + 'custom.css', nom: 'custom.css', titre: 'tout le site' }].concat(list).forEach(function (f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'copy-item';
        b.innerHTML = '<span></span><small></small>';
        b.firstChild.textContent = f.nom;
        b.lastChild.textContent = f.titre || '';
        b.title = 'Copier ' + f.path;
        b.addEventListener('click', function () { copyFile(f.path, f.nom); });
        box.appendChild(b);
      });
    });
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
    $('compare').setAttribute('aria-pressed', String(state.cmp));
    $('toggle-panel').setAttribute('aria-pressed', String(state.panel));
    document.body.classList.toggle('panel-closed', !state.panel);
    $('page-title').textContent = entry.titre;
    $('page-type').textContent = TYPES[entry.type] || entry.type;
    $('open-live').href = entry.url || 'https://www.reso.co/';
    document.title = entry.titre + ' · Pages Reso';
    renderChoices();
    renderPanes();
    showWarnings();
    if (update.page !== entry.id) { update.page = entry.id; renderCopyButtons(entry); }
  }

  $('widths').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.w = parseInt(b.dataset.w, 10);
    update();
  });
  function toggleCompare() { state.cmp = !state.cmp; update(); }
  function swap() { var t = state.a; state.a = state.b; state.b = t; update(); }
  $('compare').addEventListener('click', toggleCompare);
  $('swap').addEventListener('click', swap);
  $('toggle-panel').addEventListener('click', function () { state.panel = !state.panel; update(); });
  $('reset').addEventListener('click', function () {
    state.a = { v: 'proposition', c: {} };
    state.b = { v: 'production', c: {} };
    update();
  });
  $('copy-link').addEventListener('click', function () { copyText(location.href, 'Lien'); });
  $('copy-summary').addEventListener('click', function () {
    var text = state.cmp
      ? 'Réglage A\n' + summary(state.a) + '\n\nRéglage B\n' + summary(state.b)
      : summary(state.a);
    copyText(text + '\n\n' + location.href, 'Résumé');
  });
  document.addEventListener('keydown', function (e) {
    if ((e.target.closest && e.target.closest('input, textarea, select')) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'c' || e.key === 'C') toggleCompare();
    else if (e.key === 'b' || e.key === 'B') swap();
  });
  window.addEventListener('hashchange', function () { readHash(); update(); });
  new ResizeObserver(fit).observe(stage);

  Promise.all([
    fetch('preview/pages.yaml', { cache: 'no-store' }).then(function (r) { return r.text(); }),
    fetch('preview/choix.yaml', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : '[]'; })
  ]).then(function (r) {
    pages = window.jsyaml.load(r[0]) || [];
    questions = (window.jsyaml.load(r[1]) || []).filter(function (q) { return q && q.id && q.options && q.options.length; });
    readHash();
    update();
  }).catch(function (e) {
    $('page-title').textContent = 'preview/pages.yaml ou preview/choix.yaml illisible : ' + e.message;
  });
})();
