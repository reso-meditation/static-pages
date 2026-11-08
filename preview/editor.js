// Éditeur de la visionneuse : modifier les fichiers de custom-af-content/ dans le navigateur.
// Les fichiers modifiés font partie de la version de travail (preview/versions.js) : jamais écrits
// dans le dépôt, gardés dans ce navigateur, utilisés par l'aperçu à la place des fichiers du dépôt.
// Événements : « travail-change » (un fichier a changé), « travail-load » (autre version ouverte),
// « viewer-page » (la page affichée a changé).
(function () {
  'use strict';

  var T = window.ResoTravail;
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

  var draft = T.travail;             // { files: { chemin: texte }, bases: { chemin: empreinte du dépôt }, … }
  var ui = readJSON(UI_KEY, { open: false, width: 520, file: CONTENT + 'custom.css' });
  var base = {};                     // chemin -> texte du dépôt (null : absent du dépôt)
  var docs = {};                     // chemin -> CodeMirror.Doc (garde l'historique d'annulation)
  var pages = [], page = null, cm = null, current = null, timer = null, building = false;

  var hash = T.hash;
  function name(path) { return path.slice(CONTENT.length); }
  function isModified(path) { return typeof draft.files[path] === 'string'; }
  function textOf(path) { return isModified(path) ? draft.files[path] : base[path]; }

  function loadBase(path) {
    if (path in base) return Promise.resolve(base[path]);
    return T.base(path).then(function (t) { base[path] = t; return t; });
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
    // accueil.yaml (et le contenu de chaque page) d'abord : il donne la liste des widgets ;
    // puis tous les fichiers, pour savoir s'ils existent
    Promise.all(pages.map(function (p) { return loadBase(CONTENT + p.contenu); })).then(function () {
      var files = fileList();
      return Promise.all(files.map(loadBase)).then(function () { return files; });
    }).then(function (files) {
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
      ? n + ' fichier' + (n > 1 ? 's' : '') + ' modifié' + (n > 1 ? 's' : '') + ' par rapport au dépôt'
      : 'fichiers du dépôt';
    $('ed-revert').disabled = !current || !isModified(current);
    $('ed-diff').disabled = !current || !isModified(current);
    $('ed-discard').disabled = !n;
  }

  function showWarning() {
    var w = $('editor-warn');
    var msg = '';
    if (current && base[current] === null && !isModified(current)) {
      msg = name(current) + ' n\'existe pas dans le dépôt : ce que vous écrivez ici crée le fichier dans la version de travail.';
    } else if (current && base[current] === null) {
      msg = 'Nouveau fichier (absent du dépôt).';
    } else if (current && isModified(current) && draft.bases[current] !== undefined && draft.bases[current] !== hash(base[current])) {
      msg = 'Le fichier du dépôt a changé depuis que vous avez commencé à le modifier : vérifiez les différences avant de copier.';
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

  // ---------- Version de travail ----------
  function commit(path) {
    var text = docs[path].getValue();
    if (base[path] !== null && text === base[path]) {
      delete draft.files[path];
      delete draft.bases[path];
    } else {
      if (!isModified(path)) draft.bases[path] = hash(base[path]);
      draft.files[path] = text;
    }
    T.save();
    T.emit('travail-change', { path: path });
    renderTabs();
    showWarning();
  }
  // Ctrl+S : la dernière frappe est prise en compte, puis la visionneuse enregistre la version
  function saveKey() {
    if (timer && current) { clearTimeout(timer); timer = null; commit(current); }
    T.emit('editor-save');
  }
  function onChange() {
    if (building || !current) return;
    var path = current;
    clearTimeout(timer);
    timer = setTimeout(function () { commit(path); }, 300);
  }

  // ---------- Différences (lignes) ----------
  function diffLines(a, b) {
    var ops = T.diffOps(a, b);
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
    var text = ['--- ' + path + ' (dépôt)', '+++ ' + path + ' (modifié)'];
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
    $('diff-title').textContent = name(path) + ' : modifications par rapport au dépôt';
    $('diff-dialog').dataset.text = text.join('\n');
    $('diff-dialog').showModal();
  }

  // ---------- Actions ----------
  function toast(msg) { window.dispatchEvent(new CustomEvent('viewer-toast', { detail: msg })); }
  function copyCurrent() {
    if (!current) return;
    navigator.clipboard.writeText(docs[current].getValue())
      .then(function () { toast(name(current) + ' copié'); })
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
    T.save();
    T.emit('travail-change', { path: path });
    if (current) { renderTabs(); showWarning(); } else openFile(CONTENT + 'custom.css');
  }
  function discardAll() {
    if (!Object.keys(draft.files).length) return;
    if (!confirm('Rétablir les ' + Object.keys(draft.files).length + ' fichier(s) modifié(s) tels qu\'ils sont dans le dépôt ? Les choix, qui sont dans ces fichiers, reviennent aussi à leur valeur par défaut.')) return;
    draft.files = {};
    draft.bases = {};
    draft.choix = {};   // les choix étaient dans les fichiers : ils disparaissent avec eux
    draft.appl = {};
    docs = {};
    T.save();
    T.emit('travail-change', {});
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
        T.save();
        T.emit('travail-change', { path: path });
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
        extraKeys: { 'Ctrl-S': saveKey, 'Cmd-S': saveKey }
      });
      cm.on('change', onChange);
    }
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
  window.addEventListener('travail-change', function (e) {
    // accueil.yaml modifié : la liste des widgets (onglets) peut changer ; fichiers modifiés hors éditeur
    if (e.detail && e.detail.externe) return reloadDocs();
    if (e.detail && e.detail.path && /accueil\.yaml$/.test(e.detail.path)) renderTabs();
  });
  // Autre version ouverte (ou modifiée dans un autre onglet) : l'éditeur montre ses fichiers
  function reloadDocs() {
    Object.keys(docs).forEach(function (p) {
      var t = textOf(p);
      if (t === null || t === undefined) { delete docs[p]; return; }
      if (docs[p].getValue() !== t) { building = true; docs[p].setValue(t); building = false; }
    });
    if (!ui.open || !cm) return;
    if (current && !docs[current]) { current = null; openFile(CONTENT + 'custom.css'); }
    else { renderTabs(); showWarning(); }
  }
  window.addEventListener('travail-load', reloadDocs);

  fetch('preview/pages.yaml', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
    pages = window.jsyaml.load(t) || [];
    if (ui.open) setOpen(true);
  });
})();
