// Visionneuse : affiche une page de preview/pages.yaml via preview.html, dans une version
// (Production, Proposition ou version enregistrée) et son brouillon éventuel : voir preview/versions.js.
// On passe d'une page à l'autre par le menu déroulant ou par le vrai menu de la page affichée
// (voir « Navigation » dans preview.js).
// Adresse : #page=…&w=…[&v=production | &v=<nom de la version>] ; un lien de partage ajoute
// &partage=… (la version entière).
(function () {
  'use strict';

  var T = window.ResoTravail;
  // Numéro de révision des scripts (?r= dans index.html et preview.html) : passé à l'aperçu pour
  // que le navigateur ne mélange pas d'anciens et de nouveaux scripts. À augmenter à chaque modification.
  var REV = (document.currentScript && /[?&]r=(\w+)/.exec(document.currentScript.src) || [])[1];
  var C = T.CONTENT;
  var TYPES = { 'page-statique': 'Page statique', 'accueil': 'Accueil (widgets)' };
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var pages = [], questions = [];
  var state = { page: null, w: 1366, panel: true, v: 'travail' };

  // ---------- État <-> adresse ----------
  // Renvoie { version, partage } : version demandée (undefined : Proposition), lien de partage
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.page = h.get('page') || (pages[0] && pages[0].id);
    state.w = parseInt(h.get('w'), 10) || 1366;
    var v = h.get('v');
    state.v = v === 'production' ? 'production' : 'travail';
    // en Production, « de » garde la version regardée avant (pour y revenir)
    return { version: v === 'production' ? h.get('de') : v, partage: h.get('partage') };
  }
  function writeHash() {
    var h = new URLSearchParams({ page: state.page, w: state.w });
    if (state.v === 'production') { h.set('v', 'production'); if (T.travail.nom) h.set('de', T.travail.nom); }
    else if (T.travail.nom) h.set('v', T.travail.nom);
    history.replaceState(null, '', '#' + h.toString());
  }

  // ---------- Choix ----------
  function selected(q) {
    var id = T.travail.choix[q.id];
    return (q.options || []).some(function (o) { return o.id === id; }) ? id : q.options[0].id;
  }
  function nonDefault() {
    return questions.filter(function (q) { return selected(q) !== q.options[0].id; });
  }
  function option(q, id) { return (q.options || []).find(function (x) { return x.id === id; }); }
  function optionTitle(q, id) { var o = option(q, id); return o ? o.titre : id; }

  // Cocher une réponse modifie les fichiers (preview/choix-fichiers.js) : la réponse précédente est
  // d'abord défaite, puis la nouvelle appliquée. Les changements passent l'un après l'autre (file d'attente).
  var CF = window.ResoChoixFichiers;
  var queue = Promise.resolve();
  function pick(q, id) {
    queue = queue.then(function () { return pickNow(q, id); }).catch(function (e) {
      toast('Choix impossible : ' + e.message);
      console.warn(e);
    });
    return queue;
  }
  function pickNow(q, id) {
    var prev = selected(q);
    if (id === prev && (id === q.options[0].id || T.travail.appl[q.id])) return Promise.resolve();
    var overlay = {}, problems = [];
    function read(p) { return p in overlay ? Promise.resolve(overlay[p]) : T.read(p); }
    var undo = T.travail.appl[q.id];
    var step = !undo ? Promise.resolve() : Promise.all(Object.keys(undo.edits || {}).map(function (p) {
      return read(p).then(function (t) {
        var r = t === null ? null : CF.revert(t, undo.edits[p]);
        if (r === null) problems.push(p.slice(C.length)); else overlay[p] = r;
      });
    })).then(function () { (undo.created || []).forEach(function (p) { overlay[p] = null; }); });
    return step.then(function () {
      if (problems.length) {
        alert('Impossible de défaire automatiquement « ' + optionTitle(q, prev) + ' » : ' + problems.join(', ') +
          ' a été trop modifié depuis. Retirez ces modifications dans l\'éditeur (Différences), ou annulez les modifications de la version.');
        renderChoices();
        return;
      }
      var o = option(q, id);
      var apply = id === q.options[0].id ? Promise.resolve({ changes: {}, bad: [] })
        : CF.apply(q, o, read, questions.map(function (x) { return x.id; }));
      return apply.then(function (res) {
        var paths = Object.keys(res.changes);
        return Promise.all(paths.map(read)).then(function (befores) {
          var rec = { edits: {}, created: [] };
          paths.forEach(function (p, i) {
            if (befores[i] === null) rec.created.push(p);
            else rec.edits[p] = CF.hunks(befores[i], res.changes[p], T.diffOps);
            overlay[p] = res.changes[p];
          });
          return T.writeFiles(overlay).then(function () {
            if (id === q.options[0].id) { delete T.travail.choix[q.id]; delete T.travail.appl[q.id]; }
            else { T.travail.choix[q.id] = id; T.travail.appl[q.id] = rec; }
            T.save();
            T.emit('travail-change', { externe: true, choix: true });
            if (res.bad.length) alert('À vérifier :\n' + res.bad.join('\n'));
          });
        });
      });
    });
  }
  // Toutes les questions à leur première réponse (les choix sont défaits du dernier au premier)
  function resetChoices() {
    nonDefault().reverse().forEach(function (q) { pick(q, q.options[0].id); });
  }
  // Ancien format (choix appliqués à l'affichage, sans les fichiers) : on les applique aux fichiers
  var migrating = false;
  function migrateChoices() {
    var todo = questions.filter(function (q) { return T.travail.choix[q.id] && !T.travail.appl[q.id]; });
    if (!todo.length || migrating) return;
    migrating = true;
    var wanted = {};
    todo.forEach(function (q) { wanted[q.id] = T.travail.choix[q.id]; delete T.travail.choix[q.id]; });
    todo.forEach(function (q) { pick(q, wanted[q.id]); });
    queue.then(function () { migrating = false; });
  }

  // ---------- Versions ----------
  function versionName() { return T.travail.nom || 'Proposition'; }
  function modifiedFiles() { return Object.keys(T.travail.files).map(function (p) { return p.slice(C.length); }); }
  function plural(n, word) { return n + ' ' + word + (n > 1 ? 's' : ''); }
  function label() {
    if (state.v === 'production') return 'Production (en ligne)';
    var parts = nonDefault().map(function (q) { return optionTitle(q, selected(q)); });
    var n = modifiedFiles().length;
    if (n) parts.push(plural(n, 'fichier') + ' ' + (n > 1 ? 'modifiés' : 'modifié'));
    return versionName() + (T.isDirty() ? ' * (brouillon)' : '') + (parts.length ? ' · ' + parts.join(', ') : '');
  }
  function sortedNames() { return Object.keys(T.versions).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); }

  function renderVersions() {
    var sel = $('version-select');
    sel.replaceChildren();
    function opt(parent, value, text) {
      var o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      parent.appendChild(o);
    }
    var nom = T.travail.nom;
    var g1 = document.createElement('optgroup');
    g1.label = 'Lecture seule';
    opt(g1, 'production', 'Production (en ligne)');
    opt(g1, 'proposition', 'Proposition (dépôt)' + (T.hasDraft(null) ? ' *' : ''));
    sel.appendChild(g1);
    var names = sortedNames();
    var g2 = document.createElement('optgroup');
    g2.label = names.length ? 'Mes versions (modifiables)' : 'Mes versions : aucune pour l\'instant';
    names.forEach(function (n) { opt(g2, 'v:' + n, n + (T.hasDraft(n) ? ' *' : '')); });
    sel.appendChild(g2);
    sel.value = state.v === 'production' ? 'production' : nom ? 'v:' + nom : 'proposition';
    renderDraftBar();
  }

  // Boutons de la version (barre d'outils) et bandeau d'état en dessous
  function renderDraftBar() {
    var bar = $('draft-bar'), text = $('draft-text');
    var prod = state.v === 'production', dirty = T.isDirty(), editable = T.isEditable(), nom = versionName();
    $('version-save').disabled = prod || !dirty || !editable;
    $('version-save').title = prod || !editable ? 'Production et Proposition ne se modifient pas : « Enregistrer sous… »'
      : dirty ? 'Enregistrer le brouillon dans « ' + nom + ' » (Ctrl+S dans l\'éditeur)' : 'Rien à enregistrer';
    $('version-saveas').disabled = prod;
    $('version-discard').disabled = prod || !dirty;
    bar.className = 'draft-bar';
    if (prod) {
      bar.classList.add('readonly');
      text.textContent = 'Production : ce qui est en ligne, en lecture seule.';
    } else if (dirty) {
      bar.classList.add('dirty');
      text.textContent = 'Brouillon de « ' + nom + ' » : modifications non enregistrées (gardées dans ce navigateur).' +
        (editable ? '' : ' La Proposition ne se modifie pas : « Enregistrer sous… » en fait une version.');
    } else if (editable) {
      text.textContent = '« ' + nom + ' » : version enregistrée dans ce navigateur. Les choix et l\'éditeur la modifient.';
    } else {
      bar.classList.add('readonly');
      text.textContent = 'Proposition : custom-af-content/ tel qu\'il est dans le dépôt, en lecture seule. ' +
        'Les choix et l\'éditeur créent un brouillon.';
    }
  }

  // Boîte de dialogue : { titre, texte, champ (valeur initiale, facultatif), boutons: [{ id, texte, principal }] }
  // Renvoie une promesse { bouton, valeur } (bouton null : fermée par Échap).
  function ask(o) {
    var d = $('ask-dialog');
    $('ask-title').textContent = o.titre;
    $('ask-text').textContent = o.texte || '';
    $('ask-text').hidden = !o.texte;
    var input = $('ask-input');
    input.hidden = o.champ === undefined;
    input.value = o.champ || '';
    var box = $('ask-buttons');
    box.replaceChildren();
    return new Promise(function (resolve) {
      var done = false;
      function finish(id) {
        if (done) return;
        done = true;
        d.onclose = null;
        if (d.open) d.close();
        resolve({ bouton: id, valeur: input.value.trim() });
      }
      o.boutons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn' + (b.principal ? ' primary' : '');
        btn.textContent = b.texte;
        btn.addEventListener('click', function () { finish(b.id); });
        box.appendChild(btn);
      });
      d.onclose = function () { finish(null); };
      $('ask-form').onsubmit = function (e) {
        e.preventDefault();
        var p = o.boutons.find(function (b) { return b.principal; });
        if (p) finish(p.id);
      };
      d.showModal();
      if (!input.hidden) { input.focus(); input.select(); }
      else { var p = box.querySelector('.primary'); if (p) p.focus(); }
    });
  }

  // Demande un nom (et confirme le remplacement d'une version du même nom). null : annulé.
  function askName(titre, initial, garder) {
    return ask({ titre: titre, texte: 'Nom de la version (gardée dans ce navigateur) :', champ: initial,
      boutons: [{ id: 'annuler', texte: 'Annuler' }, { id: 'ok', texte: 'Enregistrer', principal: true }] })
      .then(function (r) {
        if (r.bouton !== 'ok' || !r.valeur) return null;
        if (!T.versions[r.valeur] || r.valeur === garder) return r.valeur;
        return ask({ titre: 'Remplacer « ' + r.valeur + ' » ?', texte: 'Une version enregistrée porte déjà ce nom.',
          boutons: [{ id: 'non', texte: 'Annuler' }, { id: 'oui', texte: 'Remplacer', principal: true }] })
          .then(function (c) { return c.bouton === 'oui' ? r.valeur : null; });
      });
  }
  function suggestName() {
    return T.freeName('Version du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }));
  }
  // Enregistrer : le brouillon remplace la version regardée (si elle est modifiable).
  // Enregistrer sous… (saveAs, ou version non modifiable) : nouvelle version. Promesse : false si annulé.
  function saveCurrent(saveAs) {
    if (T.isEditable() && !saveAs) {
      T.saveAs(T.travail.nom);
      toast('« ' + T.travail.nom + ' » enregistrée');
      return Promise.resolve(true);
    }
    return askName('Enregistrer sous…', T.travail.nom ? T.freeName(T.travail.nom + ' (copie)') : suggestName())
      .then(function (nom) {
        if (!nom) return false;
        T.saveAs(nom);
        toast('« ' + nom + ' » enregistrée');
        return true;
      });
  }
  // target : 'production', 'proposition' ou 'v:<nom>'. Chaque version garde son brouillon : rien à demander.
  function chooseVersion(target) {
    if (target === 'production') { state.v = 'production'; return update(); }
    var nom = target.indexOf('v:') === 0 ? target.slice(2) : null;
    if (nom !== T.travail.nom) T.open(nom);
    state.v = 'travail';
    update();
  }

  function renderVersionsDialog() {
    var list = $('versions-list');
    list.replaceChildren();
    var names = sortedNames();
    $('versions-empty').hidden = names.length > 0;
    names.forEach(function (n) {
      var v = T.versions[n];
      var li = document.createElement('li');
      var info = document.createElement('div');
      info.className = 'version-info';
      var t = document.createElement('strong');
      t.textContent = n;
      var tags = [];
      if (n === T.travail.nom && state.v !== 'production') tags.push('affichée');
      if (T.hasDraft(n)) tags.push('brouillon non enregistré');
      if (tags.length) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tags.join(', ');
        t.appendChild(tag);
      }
      var s = document.createElement('small');
      var nc = Object.keys(v.choix || {}).length, nf = Object.keys(v.files || {}).length;
      s.textContent = new Date(v.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' +
        nc + ' choix' + ', ' + plural(nf, 'fichier') + ' ' + (nf > 1 ? 'modifiés' : 'modifié');
      info.append(t, s);
      li.appendChild(info);
      function btn(text, fn, cls) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = cls || 'btn';
        b.textContent = text;
        b.addEventListener('click', fn);
        li.appendChild(b);
      }
      if (n !== T.travail.nom || state.v === 'production') btn('Ouvrir', function () { $('versions-dialog').close(); chooseVersion('v:' + n); });
      btn('Renommer', function () {
        askName('Renommer « ' + n + ' »', n, n).then(function (nouveau) {
          if (nouveau) T.rename(n, nouveau);
          renderVersionsDialog();
        });
      });
      btn('Supprimer', function () {
        if (!confirm('Supprimer la version « ' + n + ' »' + (T.hasDraft(n) ? ' et son brouillon' : '') + ' de ce navigateur ?')) return;
        T.remove(n);
        renderVersionsDialog();
      }, 'link-btn');
      list.appendChild(li);
    });
    $('versions-saveas').disabled = state.v === 'production';
  }

  // ---------- Panneau des choix ----------
  function renderChoices() {
    var box = $('choices');
    box.replaceChildren();
    var production = state.v === 'production';
    if (production) {
      var note = document.createElement('p');
      note.className = 'hint choice-note';
      note.textContent = 'Production : lecture seule, les choix ne s\'appliquent pas.';
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
      var fs = document.createElement('fieldset');
      fs.className = 'choice';
      var lg = document.createElement('legend');
      lg.textContent = q.question;
      fs.appendChild(lg);
      (q.options || []).forEach(function (o) {
        var lab = document.createElement('label');
        lab.className = 'choice-row' + (production ? ' disabled' : '');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = q.id;
        input.value = o.id;
        input.checked = selected(q) === o.id;
        input.disabled = production;
        input.addEventListener('change', function () { pick(q, o.id); });
        lab.appendChild(input);
        var txt = document.createElement('span');
        txt.className = 'choice-text';
        var t = document.createElement('span');
        t.textContent = o.titre;
        txt.appendChild(t);
        if (o.couleurs) {
          var sw = document.createElement('span');
          sw.className = 'swatches';
          o.couleurs.forEach(function (c) { var i = document.createElement('i'); i.style.background = c; sw.appendChild(i); });
          txt.appendChild(sw);
        }
        if (o.detail) {
          var d = document.createElement('small');
          d.textContent = o.detail;
          txt.appendChild(d);
        }
        lab.appendChild(txt);
        fs.appendChild(lab);
      });
      box.appendChild(fs);
    });
    var n = nonDefault().length;
    $('panel-hint').textContent = production ? '' : n ? n + (n > 1 ? ' modifiés' : ' modifié') : 'par défaut';
    $('reset').disabled = production || !n;
  }

  // ---------- Aperçu ----------
  function previewUrl() {
    var q = new URLSearchParams({ page: state.page });
    if (REV) q.set('r', REV);
    if (state.v === 'production') q.set('version', 'production');
    return 'preview.html?' + q.toString();
  }

  // L'iframe n'est rechargée que si son adresse change.
  function renderPane() {
    var pane = stage.firstElementChild;
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'pane';
      pane.innerHTML = '<div class="pane-label"><span></span><a target="_blank" rel="opener" title="Ouvrir cet aperçu seul">↗</a></div>' +
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

  // ---------- Version de travail modifiée (choix, éditeur, autre onglet) ----------
  // Les choix changent l'adresse de l'aperçu (rechargé) ; un fichier modifié lui est signalé.
  function reloadFrame() {
    var f = stage.querySelector('iframe');
    if (state.v !== 'production' && f && f.contentWindow) f.contentWindow.postMessage({ source: 'reso-viewer', type: 'travail' }, '*');
  }
  window.addEventListener('travail-change', function (e) {
    if (e.detail && (e.detail.path || e.detail.externe)) reloadFrame();   // fichiers modifiés
    if (pages.length) update();
  });
  window.addEventListener('travail-load', function () { reloadFrame(); if (pages.length) { update(); migrateChoices(); } });
  window.addEventListener('viewer-toast', function (e) { toast(e.detail); });

  // ---------- Copie ----------
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  // Le texte peut être une promesse : elle passe par ClipboardItem pour garder le geste de l'utilisateur
  // (Safari refuse d'écrire dans le presse-papier après une attente).
  function copyText(text, what) {
    var p = Promise.resolve(text), write;
    try {
      write = window.ClipboardItem && navigator.clipboard.write
        ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': p.then(function (t) { return new Blob([t], { type: 'text/plain' }); }) })])
        : p.then(function (t) { return navigator.clipboard.writeText(t); });
    } catch (e) { write = p.then(function (t) { return navigator.clipboard.writeText(t); }); }
    return write.then(function () { toast(what + ' copié dans le presse-papier'); })
      .catch(function () { toast('Copie impossible'); });
  }
  function shareLink() {
    var link = location.href.split('#')[0] + '#' + new URLSearchParams({ page: state.page, w: state.w }).toString();
    // le lien contient la version entière (son nom n'a pas de sens chez quelqu'un d'autre)
    if (state.v === 'production') return Promise.resolve(link + '&v=production');
    if (T.isEmpty()) return Promise.resolve(link);
    return T.encodeShare().then(function (data) { return link + '&partage=' + data; });
  }
  function summary() {
    if (state.v === 'production') return shareLink().then(function (l) { return 'Production : la version en ligne.\n\n' + l; });
    var lines = ['Version : ' + versionName() + (T.isDirty() ? ' (brouillon non enregistré)' : '')];
    var files = modifiedFiles();
    if (files.length) lines.push('Fichiers modifiés : ' + files.join(', '));
    questions.forEach(function (q) { lines.push('- ' + q.question + ' : ' + optionTitle(q, selected(q))); });
    return shareLink().then(function (link) { return lines.join('\n') + '\n\n' + link; });
  }

  // ---------- Lien de partage reçu ----------
  // La version du lien est ajoutée à « Mes versions » (« Reçu : … ») puis ouverte ; rien n'est écrasé.
  function receive(data) {
    T.decodeShare(data).then(function (r) {
      var nom = T.sameAs(r.version);
      if (nom) T.open(nom);
      else {
        nom = T.freeName('Reçu : ' + (r.nom || 'sans titre'));
        T.add(nom, r.version);
      }
      state.v = 'travail';
      update();
      toast('Version « ' + nom + ' » ouverte');
      if (r.problemes.length) alert('Lien de partage :\n' + r.problemes.join('\n'));
    }).catch(function (e) {
      toast('Lien de partage illisible');
      console.warn('Lien de partage illisible :', e);
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
    $('toggle-panel').setAttribute('aria-pressed', String(state.panel));
    document.body.classList.toggle('panel-closed', !state.panel);
    $('page-select').value = entry.id;
    $('page-type').textContent = TYPES[entry.type] || entry.type;
    $('open-live').href = entry.url || 'https://www.reso.co/';
    document.title = entry.titre + ' · Pages Reso';
    window.dispatchEvent(new CustomEvent('viewer-page', { detail: entry.id }));
    document.body.classList.toggle('mode-production', state.v === 'production');
    $('toggle-editor').disabled = state.v === 'production';
    $('toggle-editor').title = state.v === 'production' ? 'La Production est en lecture seule'
      : 'Modifier les fichiers de custom-af-content/ (brouillon de la version affichée)';
    renderVersions();
    renderChoices();
    renderPane();
    showWarnings();
    if ($('versions-dialog').open) renderVersionsDialog();
  }

  $('widths').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.w = parseInt(b.dataset.w, 10);
    update();
  });
  $('toggle-panel').addEventListener('click', function () { state.panel = !state.panel; update(); });
  $('version-select').addEventListener('change', function (e) { chooseVersion(e.target.value); });
  $('version-more').addEventListener('click', function () { renderVersionsDialog(); $('versions-dialog').showModal(); });
  $('versions-close').addEventListener('click', function () { $('versions-dialog').close(); });
  $('versions-saveas').addEventListener('click', function () { saveCurrent(true).then(update); });
  $('version-save').addEventListener('click', function () { saveCurrent(false).then(update); });
  $('version-saveas').addEventListener('click', function () { saveCurrent(true).then(update); });
  $('version-discard').addEventListener('click', function () {
    ask({ titre: 'Annuler les modifications ?', texte: 'Le brouillon est abandonné : « ' + versionName() + ' » revient telle qu\'elle est enregistrée.',
      boutons: [{ id: 'non', texte: 'Garder le brouillon' }, { id: 'oui', texte: 'Annuler les modifications', principal: true }] })
      .then(function (r) { if (r.bouton === 'oui') T.discard(); });
  });
  // Ctrl+S dans l'éditeur
  window.addEventListener('editor-save', function () {
    if (state.v === 'production' || !T.isDirty()) return toast('Rien à enregistrer');
    saveCurrent(false).then(update);
  });
  $('reset').addEventListener('click', resetChoices);
  $('copy-link').addEventListener('click', function () { copyText(shareLink(), 'Lien de partage'); });
  $('copy-summary').addEventListener('click', function () { copyText(summary(), 'Résumé'); });
  // Version demandée par l'adresse (rechargement, lien vers une version enregistrée, lien de partage)
  function fromHash() {
    var h = readHash();
    var want = h.version && T.versions[h.version] ? h.version : null;
    if (h.version && !want) toast('Version « ' + h.version + ' » introuvable dans ce navigateur');
    if (want !== T.travail.nom) T.open(want);
    update();
    migrateChoices();
    if (h.partage) receive(h.partage);
  }
  window.addEventListener('hashchange', fromHash);
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
    fromHash();
  }).catch(function (e) {
    warnings = ['preview/pages.yaml ou preview/choix.yaml illisible : ' + e.message];
    showWarnings();
  });
})();
