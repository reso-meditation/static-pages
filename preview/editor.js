// Éditeur de la visionneuse : modifier les fichiers de custom-af-content/ dans le navigateur.
// Les modifications forment un « brouillon » : jamais écrit dans le dépôt, gardé en mémoire
// (window.__resoBrouillon, lu par les aperçus) et sauvegardé dans ce navigateur (localStorage).
// L'aperçu en version « Brouillon » les utilise à la place des fichiers du dépôt.
// Échanges avec viewer.js par événements : « brouillon-change » (le brouillon a changé),
// « editor-open » (l'éditeur s'ouvre), « viewer-page » (la page affichée a changé).
(function () {
  'use strict';

  var KEY = 'reso-brouillon-v1';      // { files: { chemin: texte }, bases: { chemin: empreinte du dépôt } }
  var UI_KEY = 'reso-editeur-ui';     // { open, width, file }
  var CONTENT = 'custom-af-content/';
  var MODES = { css: 'css', yaml: 'yaml', html: 'htmlmixed' };
  var $ = function (id) { return document.getElementById(id); };

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  var draft = readJSON(KEY, null) || { files: {}, bases: {} };
  draft.files = draft.files || {};
  draft.bases = draft.bases || {};
  window.__resoBrouillon = draft;
  var saved = true;                  // false si le navigateur refuse la sauvegarde (navigation privée…)
  var ui = readJSON(UI_KEY, { open: false, width: 520, file: CONTENT + 'custom.css' });
  var base = {};                     // chemin -> texte du dépôt (null : absent du dépôt)
  var docs = {};                     // chemin -> CodeMirror.Doc (garde l'historique d'annulation)
  var pages = [], page = null, cm = null, current = null, timer = null, building = false;

  // Empreinte d'un texte : savoir si le fichier du dépôt a changé depuis le début du brouillon
  function hash(s) {
    if (s === null || s === undefined) return null;
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }
  function name(path) { return path.slice(CONTENT.length); }
  function isModified(path) { return typeof draft.files[path] === 'string'; }
  function textOf(path) { return isModified(path) ? draft.files[path] : base[path]; }

  function loadBase(path) {
    if (path in base) return Promise.resolve(base[path]);
    return fetch(path, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .catch(function () { return null; })
      .then(function (t) { base[path] = t; return t; });
  }

  // ---------- Liste des fichiers ----------
  // Ceux de la page affichée d'abord (contenu, puis widgets « html libre » de l'accueil),
  // puis custom.css et menus.yaml, puis ceux des autres pages, puis les nouveaux fichiers.
  function widgetFiles(accueilPath) {
    try {
      var list = window.jsyaml.load(textOf(accueilPath) || '');
      return (Array.isArray(list) ? list : []).filter(function (w) { return w && typeof w.html === 'string'; })
        .map(function (w) { return CONTENT + w.html; });
    } catch (e) { return []; }
  }
  function pageFiles(p) {
    var main = CONTENT + p.contenu;
    return p.type === 'accueil' ? [main].concat(widgetFiles(main)) : [main];
  }
  function fileList() {
    var cur = pages.find(function (p) { return p.id === page; });
    var list = [];
    function add(f) { if (list.indexOf(f) < 0) list.push(f); }
    if (cur) pageFiles(cur).forEach(add);
    add(CONTENT + 'custom.css');
    add(CONTENT + 'menus.yaml');
    pages.forEach(function (p) { if (p !== cur) pageFiles(p).forEach(add); });
    Object.keys(draft.files).forEach(add);
    return list;
  }

  // ---------- Affichage ----------
  function renderTabs() {
    var box = $('editor-tabs');
    var files = fileList();
    // les widgets listés dans accueil.yaml doivent être chargés pour savoir s'ils existent
    Promise.all(files.map(loadBase)).then(function () {
      box.replaceChildren();
      files.forEach(function (path) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'editor-tab';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(path === current));
        b.textContent = name(path);
        if (isModified(path)) b.classList.add('modified');
        if (base[path] === null) b.classList.add('new');
        b.title = path + (isModified(path) ? ' (modifié)' : '') + (base[path] === null ? ' (absent du dépôt)' : '');
        b.addEventListener('click', function () { openFile(path); });
        box.appendChild(b);
      });
    });
    var n = Object.keys(draft.files).length;
    $('editor-status').textContent = n
      ? n + ' fichier' + (n > 1 ? 's' : '') + ' modifié' + (n > 1 ? 's' : '') + (saved ? ' · gardé dans ce navigateur' : ' · non sauvegardé (navigateur)')
      : 'aucune modification';
    $('ed-revert').disabled = !current || !isModified(current);
    $('ed-diff').disabled = !current || !isModified(current);
    $('ed-discard').disabled = !n;
  }

  function showWarning() {
    var w = $('editor-warn');
    var msg = '';
    if (current && base[current] === null && !isModified(current)) {
      msg = name(current) + ' n\'existe pas dans le dépôt : ce que vous écrivez ici crée le fichier dans le brouillon.';
    } else if (current && base[current] === null) {
      msg = 'Nouveau fichier (absent du dépôt).';
    } else if (current && isModified(current) && draft.bases[current] !== undefined && draft.bases[current] !== hash(base[current])) {
      msg = 'Le fichier du dépôt a changé depuis le début de ce brouillon : vérifiez les différences avant de copier.';
    }
    w.textContent = msg;
    w.hidden = !msg;
  }

  function openFile(path) {
    loadBase(path).then(function () {
      current = path;
      ui.file = path;
      writeJSON(UI_KEY, ui);
      if (!docs[path]) {
        var ext = path.split('.').pop();
        docs[path] = new window.CodeMirror.Doc(textOf(path) || '', MODES[ext] || 'text/plain');
      }
      building = true;
      cm.swapDoc(docs[path]);
      building = false;
      cm.focus();
      renderTabs();
      showWarning();
    });
  }

  // ---------- Brouillon ----------
  function commit(path) {
    var text = docs[path].getValue();
    if (base[path] !== null && text === base[path]) {
      delete draft.files[path];
      delete draft.bases[path];
    } else {
      if (!isModified(path)) draft.bases[path] = hash(base[path]);
      draft.files[path] = text;
    }
    saved = writeJSON(KEY, draft);
    window.dispatchEvent(new CustomEvent('brouillon-change', { detail: { path: path } }));
    renderTabs();
    showWarning();
  }
  function onChange() {
    if (building || !current) return;
    var path = current;
    clearTimeout(timer);
    timer = setTimeout(function () { commit(path); }, 300);
  }

  // ---------- Différences (lignes) ----------
  function diffLines(a, b) {
    a = (a || '').split('\n');
    b = (b || '').split('\n');
    var pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    var suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    var A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
    var n = A.length, m = B.length, mid = [];
    if (n * m > 4e6) {
      A.forEach(function (l) { mid.push(['-', l]); });
      B.forEach(function (l) { mid.push(['+', l]); });
    } else {
      var w = m + 1, L = new Uint32Array((n + 1) * w);
      for (var i = n - 1; i >= 0; i--) {
        for (var j = m - 1; j >= 0; j--) {
          L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
        }
      }
      var x = 0, y = 0;
      while (x < n && y < m) {
        if (A[x] === B[y]) { mid.push([' ', A[x]]); x++; y++; }
        else if (L[(x + 1) * w + y] >= L[x * w + y + 1]) { mid.push(['-', A[x]]); x++; }
        else { mid.push(['+', B[y]]); y++; }
      }
      while (x < n) mid.push(['-', A[x++]]);
      while (y < m) mid.push(['+', B[y++]]);
    }
    var ops = a.slice(0, pre).map(function (l) { return [' ', l]; }).concat(mid, a.slice(a.length - suf).map(function (l) { return [' ', l]; }));
    // numéros de ligne (fichier du dépôt, fichier modifié)
    var na = 0, nb = 0;
    return ops.map(function (o) {
      if (o[0] !== '+') na++;
      if (o[0] !== '-') nb++;
      return { t: o[0], s: o[1], a: na, b: nb };
    });
  }
  // Garde 3 lignes de contexte autour des changements
  function hunks(ops) {
    var keep = ops.map(function () { return false; });
    ops.forEach(function (o, i) {
      if (o.t !== ' ') for (var k = Math.max(0, i - 3); k <= Math.min(ops.length - 1, i + 3); k++) keep[k] = true;
    });
    var out = [], skipped = false;
    ops.forEach(function (o, i) {
      if (keep[i]) { out.push(o); skipped = false; }
      else if (!skipped) { out.push(null); skipped = true; }
    });
    return out;
  }
  function showDiff() {
    if (!current) return;
    var path = current;
    var ops = hunks(diffLines(base[path], docs[path].getValue()));
    var body = $('diff-body');
    body.replaceChildren();
    var text = ['--- ' + path + ' (dépôt)', '+++ ' + path + ' (brouillon)'];
    ops.forEach(function (o) {
      var line = document.createElement('div');
      if (!o) {
        line.className = 'diff-skip';
        line.textContent = '…';
        text.push('…');
      } else {
        line.className = 'diff-line ' + (o.t === '+' ? 'add' : o.t === '-' ? 'del' : 'ctx');
        line.textContent = (o.t === ' ' ? ' ' : o.t) + String(o.t === '+' ? o.b : o.a).padStart(5) + '  ' + o.s;
        text.push(o.t + ' ' + o.s);
      }
      body.appendChild(line);
    });
    $('diff-title').textContent = name(path) + ' : brouillon comparé au dépôt';
    $('diff-dialog').dataset.text = text.join('\n');
    $('diff-dialog').showModal();
  }

  // ---------- Actions ----------
  function toast(msg) { window.dispatchEvent(new CustomEvent('viewer-toast', { detail: msg })); }
  function copyCurrent() {
    if (!current) return;
    navigator.clipboard.writeText(docs[current].getValue())
      .then(function () { toast(name(current) + ' (brouillon) copié'); })
      .catch(function () { toast('Copie impossible'); });
  }
  function revertCurrent() {
    if (!current || !isModified(current)) return;
    if (!confirm('Rétablir ' + name(current) + ' tel qu\'il est dans le dépôt ? Vos modifications de ce fichier seront perdues.')) return;
    var path = current;
    delete draft.files[path];
    delete draft.bases[path];
    if (base[path] === null) {   // nouveau fichier : il disparaît
      delete docs[path];
      current = null;
    } else {
      building = true;
      docs[path].setValue(base[path]);
      building = false;
    }
    saved = writeJSON(KEY, draft);
    window.dispatchEvent(new CustomEvent('brouillon-change', { detail: { path: path } }));
    if (current) { renderTabs(); showWarning(); } else openFile(CONTENT + 'custom.css');
  }
  function discardAll() {
    if (!Object.keys(draft.files).length) return;
    if (!confirm('Abandonner tout le brouillon (' + Object.keys(draft.files).length + ' fichier(s)) ? Cette action est définitive.')) return;
    draft.files = {};
    draft.bases = {};
    docs = {};
    saved = writeJSON(KEY, draft);
    window.dispatchEvent(new CustomEvent('brouillon-change', { detail: {} }));
    openFile(fileList().indexOf(current) >= 0 && base[current] !== null ? current : CONTENT + 'custom.css');
  }
  function newFile() {
    var n = prompt('Nom du nouveau fichier dans custom-af-content/ (ex. html-widget6.html) :', '');
    if (n === null) return;
    n = n.trim();
    if (!/^[a-z0-9][a-z0-9_-]*\.(html|css|yaml)$/.test(n)) { alert('Nom attendu : lettres minuscules, chiffres, tirets, et l\'extension .html, .css ou .yaml.'); return; }
    var path = CONTENT + n;
    loadBase(path).then(function (t) {
      if (t === null && !isModified(path)) {
        draft.files[path] = '';
        draft.bases[path] = null;
        saved = writeJSON(KEY, draft);
        if (/^html-widget/.test(n)) toast('Pour l\'afficher, ajoutez « - html: ' + n + ' » dans accueil.yaml');
      }
      openFile(path);
    });
  }

  // ---------- Panneau ----------
  function setOpen(open) {
    ui.open = open;
    writeJSON(UI_KEY, ui);
    $('editor').hidden = !open;
    $('editor-resizer').hidden = !open;
    $('toggle-editor').setAttribute('aria-pressed', String(open));
    document.body.style.setProperty('--editor-w', ui.width + 'px');
    if (!open) return;
    if (!cm) {
      cm = window.CodeMirror($('editor-cm'), {
        lineNumbers: true,
        lineWrapping: false,
        matchBrackets: true,
        styleActiveLine: true,
        indentUnit: 4,
        tabSize: 4,
        extraKeys: { 'Ctrl-S': function () { toast('Le brouillon est gardé automatiquement dans ce navigateur'); }, 'Cmd-S': function () { toast('Le brouillon est gardé automatiquement dans ce navigateur'); } }
      });
      cm.on('change', onChange);
    }
    window.dispatchEvent(new CustomEvent('editor-open'));
    openFile(fileList().indexOf(ui.file) >= 0 || isModified(ui.file) ? ui.file : CONTENT + 'custom.css');
    setTimeout(function () { cm.refresh(); }, 0);
  }

  // Redimensionnement du panneau
  (function () {
    var r = $('editor-resizer'), dragging = false;
    r.addEventListener('pointerdown', function (e) { dragging = true; r.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); });
    r.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      ui.width = Math.max(320, Math.min(window.innerWidth * 0.7, e.clientX));
      document.body.style.setProperty('--editor-w', ui.width + 'px');
    });
    r.addEventListener('pointerup', function () {
      dragging = false;
      document.body.classList.remove('resizing');
      writeJSON(UI_KEY, ui);
      if (cm) cm.refresh();
    });
  })();

  $('toggle-editor').addEventListener('click', function () { setOpen(!ui.open); });
  $('editor-close').addEventListener('click', function () { setOpen(false); });
  $('ed-copy').addEventListener('click', copyCurrent);
  $('ed-diff').addEventListener('click', showDiff);
  $('ed-revert').addEventListener('click', revertCurrent);
  $('ed-new').addEventListener('click', newFile);
  $('ed-discard').addEventListener('click', discardAll);
  $('diff-close').addEventListener('click', function () { $('diff-dialog').close(); });
  $('diff-copy').addEventListener('click', function () {
    navigator.clipboard.writeText($('diff-dialog').dataset.text || '')
      .then(function () { toast('Différences copiées'); })
      .catch(function () { toast('Copie impossible'); });
  });
  window.addEventListener('viewer-page', function (e) {
    page = e.detail;
    if (ui.open && cm) renderTabs();
  });
  window.addEventListener('brouillon-change', function (e) {
    // accueil.yaml modifié : la liste des widgets (onglets) peut changer
    if (e.detail && e.detail.path && /accueil\.yaml$/.test(e.detail.path)) renderTabs();
  });
  // Un autre onglet de la visionneuse a modifié le brouillon : on reprend sa version
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var d = readJSON(KEY, { files: {}, bases: {} });
    draft.files = d.files || {};
    draft.bases = d.bases || {};
    Object.keys(docs).forEach(function (p) {
      var t = textOf(p) || '';
      if (docs[p].getValue() !== t) { building = true; docs[p].setValue(t); building = false; }
    });
    window.dispatchEvent(new CustomEvent('brouillon-change', { detail: {} }));
    if (ui.open && cm) { renderTabs(); showWarning(); }
  });

  fetch('preview/pages.yaml', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
    pages = window.jsyaml.load(t) || [];
    if (ui.open) setOpen(true);
  });
})();
