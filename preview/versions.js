// Versions de la visionneuse.
//
// On regarde toujours une version : la Production (lecture seule), la Proposition (le dépôt,
// lecture seule) ou une version enregistrée dans ce navigateur (modifiable). Une version, ce sont
// des choix (preview/choix.yaml) et des fichiers de custom-af-content/ modifiés dans l'éditeur.
//
// Modifier un choix ou un fichier crée un BROUILLON de la version regardée (affichée avec « * »).
// Chaque version a le sien, gardé dans ce navigateur (localStorage) : il survit aux rechargements,
// à la fermeture du navigateur et aux changements de version. Enregistrer l'écrit dans la version
// (si elle est modifiable) ; Enregistrer sous… crée une nouvelle version ; Annuler les
// modifications l'abandonne. Une version se partage par un lien qui la contient entièrement.
//
// window.ResoTravail :
//   travail   { nom, choix: { question: réponse }, files: { chemin: texte }, bases: { chemin: empreinte },
//               appl: { question: { edits: { chemin: correctif }, created: [ chemins ] } } }
//             nom : version regardée (null : la Proposition) ; choix et fichiers : avec son brouillon
//             bases : empreinte du fichier du dépôt quand on a commencé à le modifier
//             appl : ce que chaque choix a changé dans les fichiers, pour le défaire (preview/choix-fichiers.js)
//   versions  { nom: { date, choix, files, bases, appl } }
// Événements : « travail-change » { path?, choix?, externe?, versions? } (modification),
// « travail-load » (autre version ouverte, ou brouillon modifié dans un autre onglet).
(function () {
  'use strict';

  var VERSIONS_KEY = 'reso-versions-v1';     // versions enregistrées
  var DRAFTS_KEY = 'reso-brouillons-v1';     // brouillons : { "" (Proposition) | nom: { choix, files, bases } }
  var OLD_KEYS = ['reso-brouillon-v1', 'reso-travail-v1'];   // anciens brouillons, récupérés une fois
  var OLD_SESSION_KEY = 'reso-brouillon-session-v1';
  var CONTENT = 'custom-af-content/';
  var REPO = 'reso-meditation/static-pages';

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function empty() { return { nom: null, choix: {}, files: {}, bases: {}, appl: {} }; }
  function normalize(t) {
    t = t || {};
    return { nom: t.nom || null, choix: t.choix || {}, files: t.files || {}, bases: t.bases || {}, appl: t.appl || {} };
  }
  function entry(t) { return { choix: t.choix, files: t.files, bases: t.bases, appl: t.appl }; }
  function key(nom) { return nom || ''; }

  var versions = readJSON(VERSIONS_KEY, {});
  var drafts = readJSON(DRAFTS_KEY, {});
  var saved = true;   // false si le navigateur refuse la sauvegarde (navigation privée…)

  // Empreinte d'un texte (djb2)
  function hash(s) {
    if (s === null || s === undefined) return null;
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }

  // Contenu comparable d'une version : choix et fichiers, clés triées
  function content(v) {
    var c = {}, f = {};
    Object.keys(v.choix || {}).sort().forEach(function (k) { c[k] = v.choix[k]; });
    Object.keys(v.files || {}).sort().forEach(function (k) { f[k] = v.files[k]; });
    return JSON.stringify([c, f]);
  }
  function stored(nom) { return nom && versions[nom] ? versions[nom] : empty(); }
  function isEmpty(v) { return content(v || travail) === content(empty()); }
  // Le brouillon diffère de la version regardée
  function isDirty() { return content(travail) !== content(stored(travail.nom)); }
  // Une version (null : Proposition) a un brouillon non enregistré
  function hasDraft(nom) { return nom === travail.nom ? isDirty() : !!drafts[key(nom)]; }
  // La version regardée peut recevoir le brouillon (Enregistrer) : une version enregistrée
  function isEditable() { return !!(travail.nom && versions[travail.nom]); }

  // Nom libre à partir de base : « base », « base (2) »…
  function freeName(base) {
    if (!versions[base]) return base;
    for (var i = 2; ; i++) if (!versions[base + ' (' + i + ')']) return base + ' (' + i + ')';
  }
  // Version enregistrée identique à v (même contenu), ou null
  function sameAs(v) {
    var c = content(v);
    return Object.keys(versions).find(function (n) { return content(versions[n]) === c; }) || null;
  }

  // Anciens brouillons : celui de l'onglet devient le brouillon de sa version, ceux de
  // localStorage (un seul brouillon autrefois) des versions « Brouillon récupéré »
  (function () {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(OLD_SESSION_KEY)); sessionStorage.removeItem(OLD_SESSION_KEY); } catch (e) {}
    if (s) {
      var v = normalize(s);
      if (v.nom && !versions[v.nom]) v.nom = null;
      if (!drafts[key(v.nom)] && content(v) !== content(stored(v.nom))) drafts[key(v.nom)] = entry(v);
      writeJSON(DRAFTS_KEY, drafts);
    }
    OLD_KEYS.forEach(function (k) {
      var old = readJSON(k, null);
      if (!old) return;
      var v = normalize(old);
      if (!isEmpty(v) && !sameAs(v)) {
        versions[freeName('Brouillon récupéré')] = Object.assign({ date: new Date().toISOString() }, entry(v));
        writeJSON(VERSIONS_KEY, versions);
      }
      try { localStorage.removeItem(k); } catch (e) {}
    });
  })();
  Object.keys(drafts).forEach(function (k) { if (k && !versions[k]) delete drafts[k]; });   // version supprimée

  // Version regardée au départ : la Proposition (avec son brouillon) ; la visionneuse ouvre ensuite
  // celle de l'adresse.
  var travail = normalize(drafts[''] ? clone(drafts['']) : null);

  // Garde le brouillon de la version regardée (ou l'efface s'il n'y a plus de différence)
  function save() {
    if (isDirty()) drafts[key(travail.nom)] = entry(travail);
    else delete drafts[key(travail.nom)];
    saved = writeJSON(DRAFTS_KEY, drafts);
    return saved;
  }
  function saveVersions() { saved = writeJSON(VERSIONS_KEY, versions) && saved; }
  function emit(type, detail) { window.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); }

  function load(v, nom) {   // sans changer l'objet travail, que l'éditeur et les aperçus lisent
    v = normalize(clone(v));
    travail.nom = nom || null;
    travail.choix = v.choix;
    travail.files = v.files;
    travail.bases = v.bases;
    travail.appl = v.appl;
  }
  // Ouvre une version enregistrée (nom) ou la Proposition (null), avec son brouillon s'il y en a un
  function open(nom) {
    if (nom && !versions[nom]) nom = null;
    load(drafts[key(nom)] || stored(nom), nom);
    emit('travail-load');
  }
  // Abandonne le brouillon de la version regardée
  function discard() {
    delete drafts[key(travail.nom)];
    writeJSON(DRAFTS_KEY, drafts);
    open(travail.nom);
  }
  // Enregistre le brouillon dans la version nom (nouvelle ou existante), qui devient la version regardée.
  // Enregistrer sous… depuis une autre version : celle-ci reste telle qu'elle était, sans brouillon.
  function saveAs(nom) {
    versions[nom] = Object.assign({ date: new Date().toISOString() }, clone(entry(travail)));
    saveVersions();
    delete drafts[key(travail.nom)];
    travail.nom = nom;
    save();
    emit('travail-change', { versions: true });
  }
  // Ajoute une version (lien de partage reçu) et l'ouvre
  function add(nom, v) {
    versions[nom] = Object.assign({ date: new Date().toISOString() }, clone(entry(normalize(v))));
    saveVersions();
    delete drafts[key(nom)];
    writeJSON(DRAFTS_KEY, drafts);
    open(nom);
  }
  function remove(nom) {
    delete versions[nom];
    delete drafts[key(nom)];
    saveVersions();
    writeJSON(DRAFTS_KEY, drafts);
    if (travail.nom === nom) open(null);
    else emit('travail-change', { versions: true });
  }
  function rename(nom, nouveau) {
    if (!versions[nom] || nom === nouveau) return;
    versions[nouveau] = versions[nom];
    delete versions[nom];
    if (drafts[nom]) { drafts[nouveau] = drafts[nom]; delete drafts[nom]; }
    saveVersions();
    if (travail.nom === nom) travail.nom = nouveau;
    writeJSON(DRAFTS_KEY, drafts);
    emit('travail-change', { versions: true });
  }

  // Un autre onglet a modifié les versions ou les brouillons
  window.addEventListener('storage', function (e) {
    if (e.key === VERSIONS_KEY) {
      versions = api.versions = readJSON(VERSIONS_KEY, {});
      if (travail.nom && !versions[travail.nom]) return open(null);
      emit('travail-change', { versions: true });
    } else if (e.key === DRAFTS_KEY) {
      drafts = readJSON(DRAFTS_KEY, {});
      var v = drafts[key(travail.nom)] || stored(travail.nom);
      if (content(v) !== content(travail)) { load(v, travail.nom); emit('travail-load'); }
      else emit('travail-change', { versions: true });
    }
  });

  // ---------- Fichiers du dépôt ----------
  var baseCache = {};
  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; });
  }
  // Texte d'un fichier tel qu'il est servi par ce site (null : absent)
  function base(path) {
    if (!(path in baseCache)) baseCache[path] = fetchText(path);
    return baseCache[path];
  }
  // Texte d'un fichier dans la version de travail
  function read(path) {
    return typeof travail.files[path] === 'string' ? Promise.resolve(travail.files[path]) : base(path);
  }
  // Modifie des fichiers de la version de travail (texte null : revient au dépôt)
  function writeFiles(changes) {
    var paths = Object.keys(changes);
    return Promise.all(paths.map(base)).then(function (bases) {
      paths.forEach(function (p, i) {
        var t = changes[p];
        if (t === null || (bases[i] !== null && t === bases[i])) { delete travail.files[p]; delete travail.bases[p]; return; }
        if (typeof travail.files[p] !== 'string') travail.bases[p] = hash(bases[i]);
        travail.files[p] = t;
      });
      save();
    });
  }

  // ---------- Différences par lignes ----------
  // Renvoie les opérations [' ' | '-' | '+', ligne] pour passer de a à b.
  function diffOps(a, b) {
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
    return a.slice(0, pre).map(function (l) { return [' ', l]; })
      .concat(mid, a.slice(a.length - suf).map(function (l) { return [' ', l]; }));
  }
  // Correctif compact : [[ligne de départ dans a, nb de lignes retirées, [lignes ajoutées]], …]
  function makePatch(a, b) {
    var out = [], cur = null, ia = 0;
    diffOps(a, b).forEach(function (o) {
      if (o[0] === ' ') { cur = null; ia++; return; }
      if (!cur) { cur = [ia, 0, []]; out.push(cur); }
      if (o[0] === '-') { cur[1]++; ia++; } else cur[2].push(o[1]);
    });
    return out;
  }
  function applyPatch(a, patch) {
    var lines = a.split('\n');
    for (var i = patch.length - 1; i >= 0; i--) {
      var h = patch[i];
      Array.prototype.splice.apply(lines, [h[0], h[1]].concat(h[2]));
    }
    return lines.join('\n');
  }

  // ---------- Lien de partage ----------
  // #partage=<données> : JSON compressé (deflate) en base64url. Un fichier modifié y figure comme
  // correctif par rapport au dépôt, si le fichier du dépôt est le même que celui du commit indiqué
  // (récupérable plus tard sur raw.githubusercontent.com) ; sinon en entier.
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    var s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  var shaPromise = null;
  function currentSha() {
    if (!shaPromise) {
      shaPromise = fetch('https://api.github.com/repos/' + REPO + '/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (t) { return t && /^[0-9a-f]{40}$/.test(t.trim()) ? t.trim() : null; })
        .catch(function () { return null; });
    }
    return shaPromise;
  }
  function rawAt(sha, path) { return fetchText('https://raw.githubusercontent.com/' + REPO + '/' + sha + '/' + path); }

  function encodeShare() {
    var paths = Object.keys(travail.files);
    return currentSha().then(function (sha) {
      return Promise.all(paths.map(function (p) {
        return base(p).then(function (b) {
          if (b === null || !sha) return null;
          return rawAt(sha, p).then(function (r) { return r === b ? b : null; });   // dépôt = commit : correctif possible
        });
      })).then(function (bases) {
        var f = {}, usesSha = false;
        paths.forEach(function (p, i) {
          var name = p.indexOf(CONTENT) === 0 ? p.slice(CONTENT.length) : p;
          if (bases[i] !== null) { f[name] = [hash(bases[i]), makePatch(bases[i], travail.files[p])]; usesSha = true; }
          else f[name] = travail.files[p];
        });
        var data = { n: travail.nom, c: travail.choix, a: travail.appl, f: f };
        if (usesSha) data.s = sha;
        var bytes = new TextEncoder().encode(JSON.stringify(data));
        return pipe(bytes, new CompressionStream('deflate-raw')).then(b64url);
      });
    });
  }
  // Renvoie { nom, version: { choix, files, bases }, problemes: [ … ] }
  function decodeShare(str) {
    return pipe(unb64url(str), new DecompressionStream('deflate-raw')).then(function (bytes) {
      var data = JSON.parse(new TextDecoder().decode(bytes));
      var v = { choix: data.c || {}, appl: data.a || {}, files: {}, bases: {} }, problemes = [];
      var names = Object.keys(data.f || {});
      return Promise.all(names.map(function (name) {
        var p = CONTENT + name, entry = data.f[name];
        return base(p).then(function (cur) {
          if (typeof entry === 'string') { v.files[p] = entry; v.bases[p] = hash(cur); return; }
          var h = entry[0], patch = entry[1];
          var from = cur !== null && hash(cur) === h ? Promise.resolve(cur)
            : data.s ? rawAt(data.s, p).then(function (r) { return r !== null && hash(r) === h ? r : null; })
            : Promise.resolve(null);
          return from.then(function (b) {
            if (b === null) { problemes.push(name + ' : fichier d\'origine introuvable, modifications ignorées'); return; }
            v.files[p] = applyPatch(b, patch);
            v.bases[p] = hash(b);   // fichier d'origine : l'éditeur signale si le dépôt a changé depuis
            if (cur !== null && v.files[p] === cur) { delete v.files[p]; delete v.bases[p]; }
          });
        });
      })).then(function () { return { nom: data.n || null, version: v, problemes: problemes }; });
    });
  }

  var api = window.ResoTravail = {
    travail: travail,
    versions: versions,
    CONTENT: CONTENT,
    hash: hash,
    isDirty: isDirty,
    isEditable: isEditable,
    hasDraft: hasDraft,
    discard: discard,
    add: add,
    isEmpty: isEmpty,
    isSaved: function () { return saved; },
    save: save,
    emit: emit,
    open: open,
    saveAs: saveAs,
    remove: remove,
    rename: rename,
    freeName: freeName,
    sameAs: sameAs,
    base: base,
    read: read,
    writeFiles: writeFiles,
    diffOps: diffOps,
    encodeShare: encodeShare,
    decodeShare: decodeShare
  };
})();
