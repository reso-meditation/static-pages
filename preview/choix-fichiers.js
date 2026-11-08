// Choix de preview/choix.yaml appliqués aux fichiers de custom-af-content/.
//
// Cocher une réponse modifie directement les fichiers (ce qu'on voit est toujours exactement ce
// que contiennent les fichiers, et ce qu'on copiera dans AlumnForce) :
//   css:     le fichier de preview/choix/ est ajouté à custom.css, entre deux commentaires
//            « CHOIX <question> » / « FIN CHOIX <question> », dans l'ordre des questions ;
//            ses @import vont en tête de custom.css (ailleurs, le navigateur les ignore) ;
//   menus:   menus.yaml est modifié ligne à ligne (remplacer, renommer, retirer) ;
//   accueil: accueil.yaml est modifié ligne à ligne (retirer, ajouter) ; un widget ajouté devient
//            le fichier html-widget-<nom>.html ; « remplacer » remplace le contenu du widget.
// Les lignes changées sont retenues (correctif avec contexte) pour pouvoir défaire le choix plus
// tard, même si le fichier a été modifié ailleurs entre-temps.
(function () {
  'use strict';

  var C = 'custom-af-content/';

  function optional(r) { return r.charAt(0) === '?'; }
  function strip(r) { return optional(r) ? r.slice(1).trim() : r; }
  function indentOf(l) { return l.match(/^ */)[0].length; }
  function blank(l) { return /^\s*$/.test(l); }

  // ---------- custom.css ----------
  function cssHead(q) { return '/* ===== CHOIX ' + q.id + ' : '; }
  function cssBlock(q, o, path, css) {
    return [cssHead(q) + q.question + ' → ' + o.titre + ' (' + path + ') ===== */']
      .concat(css.replace(/\s+$/, '').split('\n'), ['/* ===== FIN CHOIX ' + q.id + ' ===== */']);
  }
  // order : identifiants des questions, dans l'ordre de choix.yaml
  function addCss(text, q, o, path, css, order) {
    var imports = [];
    css = css.replace(/^[ \t]*@import\b.*(?:\n|$)/gm, function (m) { imports.push(m.trim() + ' /* CHOIX ' + q.id + ' */'); return ''; });
    var lines = text.replace(/\s+$/, '').split('\n');
    var rank = order.indexOf(q.id);
    var at = lines.findIndex(function (l) {
      var m = /^\/\* ===== CHOIX (\S+) : /.exec(l);
      return m && order.indexOf(m[1]) > rank;
    });
    var block = cssBlock(q, o, path, css);
    if (at < 0) lines = lines.concat([''], block);
    else Array.prototype.splice.apply(lines, [at, 0].concat(block, ['']));
    if (imports.length) lines = imports.concat(lines);
    return lines.join('\n') + '\n';
  }

  // ---------- menus.yaml ----------
  function title(line) {
    var m = /^\s*- titre:\s*(.*)$/.exec(line);
    if (!m) return null;
    try { return String(window.jsyaml.load(m[1].replace(/\s+#.*$/, ''))); } catch (e) { return m[1]; }
  }
  // Fin (exclue) de l'entrée qui commence à la ligne i : lignes plus indentées, sans les vides finaux
  function blockEnd(lines, i) {
    var ind = indentOf(lines[i]), j = i + 1;
    while (j < lines.length && (blank(lines[j]) || indentOf(lines[j]) > ind)) j++;
    while (j > i + 1 && blank(lines[j - 1])) j--;
    return j;
  }
  // Ligne de l'entrée désignée par « Catégorie > Entrée » (-1 : introuvable)
  function findItem(lines, path) {
    var parts = path.split('>').map(function (t) { return t.trim(); });
    var from = 0, to = lines.length, ind = 0;
    for (var k = 0; k < parts.length; k++) {
      var found = -1;
      for (var i = from; i < to; i++) {
        if (indentOf(lines[i]) === ind && title(lines[i]) === parts[k]) { found = i; break; }
      }
      if (found < 0) return -1;
      if (k === parts.length - 1) return found;
      from = found + 1;
      to = blockEnd(lines, found);
      var child = lines.slice(from, to).find(function (l) { return /^\s*- titre:/.test(l); });
      if (!child) return -1;
      ind = indentOf(child);
    }
    return -1;
  }
  function yamlScalar(s) { return window.jsyaml.dump(String(s), { lineWidth: -1 }).replace(/\n$/, ''); }
  function patchMenuText(text, m, bad) {
    var lines = text.split('\n');
    function each(paths, fn) {
      paths.forEach(function (path) {
        var p = strip(path), i = findItem(lines, p);
        if (i >= 0) fn(i, p);
        else if (!optional(path)) bad.push('menus.yaml : entrée introuvable « ' + p + ' »');
      });
    }
    each(Object.keys(m.remplacer || {}), function (i, p) {
      var entries = m.remplacer[p] || m.remplacer['?' + p] || [];
      var ind = indentOf(lines[i]) + 2, end = blockEnd(lines, i);
      var s = -1;
      for (var k = i + 1; k < end; k++) if (indentOf(lines[k]) === ind && /^\s*sous-menu:\s*$/.test(lines[k])) { s = k; break; }
      var body = window.jsyaml.dump(entries, { lineWidth: -1 }).replace(/\n$/, '').split('\n')
        .map(function (l) { return ' '.repeat(ind + 2) + l; });
      if (s < 0) Array.prototype.splice.apply(lines, [end, 0, ' '.repeat(ind) + 'sous-menu:'].concat(body));
      else {
        var e = s + 1;
        while (e < end && (blank(lines[e]) || indentOf(lines[e]) > ind)) e++;
        Array.prototype.splice.apply(lines, [s + 1, e - s - 1].concat(body));
      }
    });
    each(Object.keys(m.renommer || {}), function (i, p) {
      lines[i] = lines[i].replace(/- titre:.*$/, '- titre: ' + yamlScalar(m.renommer[p] || m.renommer['?' + p]));
    });
    each(m.retirer || [], function (i) { lines.splice(i, blockEnd(lines, i) - i); });
    return lines.join('\n');
  }

  // ---------- accueil.yaml ----------
  var refRe = /^-\s*(?:widget|html)\s*:\s*["']?([^"'#\s]+)/;
  function patchAccueilText(text, a, html, changes, bad) {
    var lines = text.split('\n');
    function find(r) {
      var name = strip(r);
      var i = lines.findIndex(function (l) { var m = l.match(refRe); return m && m[1] === name; });
      if (i < 0 && !optional(r)) bad.push('accueil.yaml : widget introuvable « ' + name + ' »');
      return i;
    }
    function end(i) {   // fin de l'entrée : lignes indentées qui suivent
      var j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j])) j++;
      return j;
    }
    (a.retirer || []).forEach(function (r) { var i = find(r); if (i >= 0) lines.splice(i, end(i) - i); });
    Object.keys(a.remplacer || {}).forEach(function (r) {
      if (find(r) >= 0) changes[C + strip(r)] = html[a.remplacer[r]];
    });
    (a.ajouter || []).forEach(function (n) {
      var file = 'html-widget-' + n.html.split('/').pop();
      changes[C + file] = html[n.html];
      var entry = ['- html: ' + file].concat(n.titre ? ['  titre: ' + n.titre] : []);
      var ref = n.apres || n.avant;
      var i = ref ? find(ref) : -1;
      if (i >= 0 && n.apres) i = end(i);
      else if (i >= 0) while (i > 0 && /^#/.test(lines[i - 1])) i--;   // avant les commentaires de l'entrée
      if (i >= 0) Array.prototype.splice.apply(lines, [i, 0].concat(entry));
      else { while (lines.length && lines[lines.length - 1] === '') lines.pop(); lines.push.apply(lines, entry.concat('')); }
    });
    return lines.join('\n');
  }

  // Calcule les fichiers modifiés par la réponse o de la question q.
  // read(chemin) : promesse du texte actuel (null : absent). order : questions dans l'ordre.
  // Renvoie une promesse { changes: { chemin: texte }, bad: [ problèmes ] }.
  function apply(q, o, read, order) {
    var changes = {}, bad = [];
    var htmlSrc = [];
    var a = o.accueil || {};
    Object.keys(a.remplacer || {}).forEach(function (k) { htmlSrc.push(a.remplacer[k]); });
    (a.ajouter || []).forEach(function (n) { htmlSrc.push(n.html); });
    var cssPath = o.css ? 'preview/choix/' + o.css : null;
    return Promise.all([
      o.css ? read(C + 'custom.css') : null,
      o.css ? fetch(cssPath, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }) : null,
      o.menus ? read(C + 'menus.yaml') : null,
      o.accueil ? read(C + 'accueil.yaml') : null,
      Promise.all(htmlSrc.map(function (f) { return fetch(f, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }); }))
    ]).then(function (r) {
      if (o.css) changes[C + 'custom.css'] = addCss(r[0] || '', q, o, cssPath, r[1] || '', order);
      if (o.menus) changes[C + 'menus.yaml'] = patchMenuText(r[2] || '', o.menus, bad);
      if (o.accueil) {
        var html = {};
        htmlSrc.forEach(function (f, i) { html[f] = r[4][i]; });
        changes[C + 'accueil.yaml'] = patchAccueilText(r[3] || '', o.accueil, html, changes, bad);
      }
      return { changes: changes, bad: bad };
    });
  }

  // ---------- Défaire : correctifs avec contexte ----------
  // hunks(avant, après) : [{ at, del: [lignes d'avant], ins: [lignes d'après], pre: [2 lignes], post: [2 lignes] }]
  // (at, pre, post : position et contexte dans « après »)
  function hunks(before, after, diffOps) {
    var ops = diffOps(before, after), out = [], cur = null, ia = 0;
    var b = after.split('\n');
    ops.forEach(function (o) {
      if (o[0] === ' ') { cur = null; ia++; return; }
      if (!cur) { cur = { at: ia, del: [], ins: [] }; out.push(cur); }
      if (o[0] === '-') cur.del.push(o[1]); else { cur.ins.push(o[1]); ia++; }
    });
    out.forEach(function (h) {
      h.pre = b.slice(Math.max(0, h.at - 2), h.at);
      h.post = b.slice(h.at + h.ins.length, h.at + h.ins.length + 2);
    });
    return out;
  }
  function matchAt(lines, i, seq) {
    if (i < 0 || i + seq.length > lines.length) return false;
    for (var k = 0; k < seq.length; k++) if (lines[i + k] !== seq[k]) return false;
    return true;
  }
  // Remet « avant » dans text (qui contient « après », éventuellement modifié ailleurs). null : impossible.
  function revert(text, hs) {
    var lines = text.split('\n'), shift = 0;
    var found = hs.map(function (h) {
      // positions où « ins » se trouve, entouré de son contexte (complet, puis partiel)
      var tries = [
        function (i) { return matchAt(lines, i - h.pre.length, h.pre) && matchAt(lines, i + h.ins.length, h.post); },
        function (i) { return matchAt(lines, i - h.pre.length, h.pre) || matchAt(lines, i + h.ins.length, h.post); },
        function () { return h.ins.length > 0; }
      ];
      var expected = h.at + shift;
      shift += h.del.length - h.ins.length;
      for (var t = 0; t < tries.length; t++) {
        var best = -1;
        for (var i = 0; i + h.ins.length <= lines.length; i++) {
          if (matchAt(lines, i, h.ins) && tries[t](i) && (best < 0 || Math.abs(i - expected) < Math.abs(best - expected))) best = i;
        }
        if (best >= 0) return best;
      }
      return -1;
    });
    if (found.some(function (i) { return i < 0; })) return null;
    // de la fin vers le début, pour ne pas décaler les positions trouvées
    var order = hs.map(function (h, k) { return k; }).sort(function (x, y) { return found[y] - found[x]; });
    order.forEach(function (k) {
      Array.prototype.splice.apply(lines, [found[k], hs[k].ins.length].concat(hs[k].del));
    });
    return lines.join('\n');
  }

  window.ResoChoixFichiers = { apply: apply, hunks: hunks, revert: revert };
})();
