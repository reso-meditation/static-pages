// Rendu d'une page dans le contexte reso.co. Ce script ne fait partie que de l'outil
// d'aperçu : le contenu de custom-af-content/ (collé dans AlumnForce) ne contient aucun JavaScript.
(function () {
  'use strict';

  var ORIGIN = 'https://www.reso.co';
  var params = new URLSearchParams(location.search);
  var pageId = params.get('page');
  var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  // Version affichée : « proposition » (custom-af-content/, ce qu'on modifie), « brouillon » (la
  // proposition + les modifications faites dans l'éditeur de la visionneuse, voir preview/editor.js)
  // ou « production » (preview/site/production/, ce qui est en ligne, capturé par tools/capture-site-chrome.js).
  var VERSION = ['production', 'brouillon'].indexOf(params.get('version')) >= 0 ? params.get('version') : 'proposition';
  var PROPOSITION = 'custom-af-content/';
  var CONTENT = VERSION === 'production' ? 'preview/site/production/' : PROPOSITION;
  var BROUILLON_KEY = 'reso-brouillon-v1';

  // Brouillon : texte modifié d'un fichier, lu dans la visionneuse (iframe) ou, aperçu ouvert seul,
  // dans la sauvegarde du navigateur. undefined : pas de modification, on lit le fichier du dépôt.
  function brouillonText(path) {
    if (VERSION !== 'brouillon') return undefined;
    var files = null;
    try { if (window.parent !== window && window.parent.__resoBrouillon) files = window.parent.__resoBrouillon.files; } catch (e) {}
    if (!files) {
      try { files = (JSON.parse(localStorage.getItem(BROUILLON_KEY)) || {}).files; } catch (e) {}
    }
    return files && typeof files[path] === 'string' ? files[path] : undefined;
  }
  // Choix (preview/choix.yaml) retenus, ex. ?choix=palette:charte,sous-menus:pastel — Proposition seulement.
  var CHOIX = {};
  (params.get('choix') || '').split(',').forEach(function (c) {
    var i = c.indexOf(':');
    if (i > 0) CHOIX[c.slice(0, i)] = c.slice(i + 1);
  });
  var choix = { css: [], menus: [] };   // fichiers CSS et modifications du menu des réponses retenues

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

  // Avertissements affichés par la visionneuse : ceux de menus.yaml, de accueil.yaml et du HTML.
  var warnings = { menu: [], widgets: [], contenu: [] };
  function notifyWarnings() { notify({ warnings: warnings.menu.concat(warnings.widgets, warnings.contenu) }); }

  function yamlLoad(text, file) {
    try { return { value: window.jsyaml.load(text) }; } catch (e) {
      return { error: file + ' : ' + e.message.split('\n')[0] };
    }
  }

  function notify(payload) {
    if (window.parent !== window) window.parent.postMessage(Object.assign({ source: 'reso-preview', page: pageId, cote: params.get('cote') || 'a' }, payload), '*');
  }

  function fetchText(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' : HTTP ' + r.status);
      return r.text();
    });
  }

  // Production : un fichier non capturé (ex. une page statique) est pris dans custom-af-content/.
  // Brouillon : un fichier modifié dans l'éditeur remplace celui du dépôt.
  function fetchContent(path) {
    var b = brouillonText(path);
    if (b !== undefined) return Promise.resolve(b);
    return fetchText(path).catch(function (e) {
      if (VERSION === 'production' && path.indexOf(CONTENT) === 0) return fetchText(PROPOSITION + path.slice(CONTENT.length));
      throw e;
    });
  }

  function showError(message) {
    main.innerHTML = '<div style="padding:2em;font-family:sans-serif;color:#9f1557"></div>';
    main.firstChild.textContent = message;
    notify({ error: message });
  }

  function htmlNode(html) {
    var t = document.createElement('template');
    t.innerHTML = absolutize(html || '').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
    return t.content;
  }

  // Widgets de l'accueil (accueil.yaml) : vérifiés, le dernier contenu valide est gardé.
  var lastWidgets = { text: null, list: [] };
  function readWidgets(entry, text) {
    if (text === lastWidgets.text) return lastWidgets.list;
    lastWidgets.text = text;
    var file = entry.contenu;
    var r = yamlLoad(text, file);
    if (r.error) { warnings.widgets = [r.error + ' (accueil non mis à jour)']; return lastWidgets.list; }
    if (!Array.isArray(r.value)) { warnings.widgets = [file + ' : le fichier doit être une liste de widgets (accueil non mis à jour).']; return lastWidgets.list; }
    var list = [], bad = [];
    r.value.forEach(function (w, i) {
      if (w && typeof w.html === 'string') list.push({ html: w.html, titre: w.titre });
      else if (w && typeof w.widget === 'string') list.push({ widget: w.widget });
      else bad.push(file + ' : widget n° ' + (i + 1) + ' sans « html: » ni « widget: »');
    });
    list.forEach(function (w, i) {
      if (w.widget === 'slider' && i > 0) bad.push(file + ' : le slider est toujours en tête sur reso.co (affiché en premier).');
    });
    warnings.widgets = bad;
    lastWidgets.list = list;
    return list;
  }

  // Fichiers HTML de custom-af-content/ qui composent la page.
  function htmlFiles(entry, widgets) {
    if (entry.type === 'accueil') {
      return widgets.filter(function (w) { return w.html; }).map(function (w) { return CONTENT + w.html; });
    }
    return [CONTENT + entry.contenu];
  }

  // Widgets capturés sur reso.co, pour la largeur courante (chargés une fois puis gardés).
  function loadCaptures(widgets, bp) {
    return Promise.all(widgets.filter(function (w) { return w.widget; }).map(function (w) {
      var key = w.widget + '.' + bp.nom;
      if (captures[key] !== undefined) return null;
      return fetchText('preview/site/widgets/' + key + '.html')
        .then(function (t) { captures[key] = t; })
        .catch(function () { captures[key] = null; });
    }));
  }

  function renderStatic(entry, files) {
    var frag = document.getElementById('tpl-page-statique').content.cloneNode(true);
    frag.querySelector('[data-slot]').appendChild(htmlNode(files[CONTENT + entry.contenu]));
    return frag;
  }

  function missing(name, bp) {
    var p = document.createElement('p');
    p.style.cssText = 'padding:1em;color:#9f1557';
    p.textContent = 'Widget « ' + name + ' » non capturé (' + bp.nom + ') : voir preview/site/widgets/widgets.json.';
    return p;
  }

  function renderAccueil(widgets, files, bp) {
    var frag = document.getElementById('tpl-accueil').content.cloneNode(true);
    frag.querySelectorAll('[data-bp]').forEach(function (el) { el.className = bp[el.dataset.bp]; });

    // Le slider : sur reso.co, au-dessus de la liste des widgets déplaçables, hors de cette liste.
    var sliderSlot = frag.querySelector('[data-slider]');
    var slider = widgets.find(function (w) { return w.widget === 'slider'; });
    if (slider) sliderSlot.replaceWith(captures['slider.' + bp.nom] ? htmlNode(captures['slider.' + bp.nom]) : missing('slider', bp));
    else sliderSlot.remove();

    var list = frag.querySelector('[data-widgets]');
    widgets.filter(function (w) { return w.widget !== 'slider'; }).forEach(function (w, i) {
      var item = document.createElement('div');
      item.className = i === 0 ? 'is-draggable' : 'mt-6 is-draggable';
      if (w.html) {
        var widget = document.getElementById('tpl-widget-html').content.cloneNode(true);
        widget.querySelector('[data-slot]').appendChild(htmlNode(files[CONTENT + w.html]));
        item.appendChild(widget);
      } else {
        var html = captures[w.widget + '.' + bp.nom];
        item.appendChild(html ? htmlNode(html) : missing(w.widget, bp));
      }
      list.appendChild(item);
    });
    return frag;
  }

  function render(entry, css, files, widgets) {
    if (css !== last.css) {
      customCss.textContent = absolutize(css);
      last.css = css;
      syncScrollableNav();
    }
    var bp = currentBreakpoint();
    var paths = htmlFiles(entry, widgets);
    var key = bp.nom + '\u0000' + JSON.stringify(widgets) + '\u0000' + paths.map(function (f) { return files[f]; }).join('\u0000');
    if (key === last.key) return notifyWarnings();
    last.key = key;

    var y = window.scrollY;
    main.replaceChildren(entry.type === 'accueil' ? renderAccueil(widgets, files, bp) : renderStatic(entry, files));
    window.scrollTo(0, y);

    warnings.contenu = [];
    widgets.forEach(function (w) {
      if (w.widget && captures[w.widget + '.' + bp.nom] === null) {
        warnings.contenu.push(entry.contenu + ' : widget « ' + w.widget + ' » inconnu (aucune capture ' + bp.nom +
          ' ; widgets disponibles dans preview/site/widgets/widgets.json)');
      }
    });
    paths.forEach(function (f) {
      if (files[f] === null) { warnings.contenu.push(f + ' : fichier introuvable'); return; }
      lint(files[f], entry.type).forEach(function (w) { warnings.contenu.push(f + ' : ' + w); });
    });
    notifyWarnings();
  }

  function load(entry) {
    var widgetsText = entry.type === 'accueil' ? fetchContent(CONTENT + entry.contenu) : Promise.resolve(null);
    var choixCss = Promise.all(choix.css.map(function (f) { return fetchText(f).catch(function () { return ''; }); }));
    return Promise.all([fetchContent(CONTENT + 'custom.css'), widgetsText, choixCss]).then(function (r) {
      var css = r[0];
      applyChoixCss(r[2]);
      var widgets = entry.type === 'accueil' ? readWidgets(entry, r[1]) : [];
      var paths = htmlFiles(entry, widgets);
      return Promise.all([
        Promise.all(paths.map(function (p) { return fetchContent(p).catch(function () { return null; }); })),
        loadCaptures(widgets, currentBreakpoint())
      ]).then(function (r2) {
        var files = {};
        paths.forEach(function (p, i) { files[p] = r2[0][i]; });   // null : fichier introuvable
        render(entry, css, files, widgets);
      });
    });
  }

  // CSS des réponses retenues : un <style> par fichier (un @import doit être en tête de sa feuille),
  // entre custom.css et le repère #choix-fin, avant les styles ajoutés par Vue (comme le serait
  // ce CSS une fois intégré à custom.css).
  var lastChoixCss = null;
  function applyChoixCss(texts) {
    var key = texts.join('\u0000');
    if (key === lastChoixCss) return;
    lastChoixCss = key;
    document.querySelectorAll('style[data-choix]').forEach(function (e) { e.remove(); });
    var end = document.getElementById('choix-fin');
    texts.forEach(function (t, i) {
      var st = document.createElement('style');
      st.setAttribute('data-choix', choix.css[i]);
      st.textContent = absolutize(t);
      end.parentNode.insertBefore(st, end);
    });
    syncScrollableNav();
  }

  // Lit preview/choix.yaml et retient, pour chaque choix, la réponse demandée (sinon la première).
  function loadChoix() {
    if (VERSION === 'production') return Promise.resolve();   // les choix s'appliquent à Proposition et Brouillon
    return fetchText('preview/choix.yaml').then(function (text) {
      var r = yamlLoad(text, 'preview/choix.yaml');
      if (r.error || !Array.isArray(r.value)) { warnings.menu.push(r.error || 'preview/choix.yaml : liste attendue'); return; }
      r.value.forEach(function (q) {
        var opts = q.options || [];
        var o = opts.find(function (x) { return x.id === CHOIX[q.id]; }) || opts[0];
        if (!o) return;
        if (o.css) choix.css.push('preview/choix/' + o.css);
        if (o.menus) choix.menus.push(o.menus);
      });
    }).catch(function () {});
  }

  // Applique au menu les modifications des réponses retenues (renommer, retirer), sur une copie.
  function patchMenu(items) {
    if (!choix.menus.length) return items;
    var copy = JSON.parse(JSON.stringify(items));
    function find(path) {
      var parts = path.split('>').map(function (t) { return t.trim(); });
      var list = copy, item = null, parent = null;
      for (var i = 0; i < parts.length; i++) {
        parent = list;
        item = (list || []).find(function (it) { return it.titre === parts[i]; });
        if (!item) return null;
        list = item['sous-menu'];
      }
      return { item: item, list: parent };
    }
    // Un chemin qui commence par « ? » est facultatif : pas d'avertissement s'il n'existe pas
    // (utile quand une autre réponse a déjà modifié cette partie du menu).
    function each(paths, fn) {
      paths.forEach(function (path) {
        var optional = path.charAt(0) === '?';
        var p = optional ? path.slice(1).trim() : path;
        var f = find(p);
        if (f) fn(f, p);
        else if (!optional) warnings.menu.push('preview/choix.yaml : entrée introuvable « ' + p + ' »');
      });
    }
    choix.menus.forEach(function (m) {
      // remplacer : { "Catégorie": [ nouvelles entrées du sous-menu ] }
      each(Object.keys(m.remplacer || {}), function (f, p) {
        f.item['sous-menu'] = JSON.parse(JSON.stringify(m.remplacer[p] || m.remplacer['?' + p] || []));
      });
      each(Object.keys(m.renommer || {}), function (f, p) { f.item.titre = m.renommer[p] || m.renommer['?' + p]; });
      each(m.retirer || [], function (f) { f.list.splice(f.list.indexOf(f.item), 1); });
    });
    return copy;
  }

  // En-tête et pied de page de reso.co, capturés par tools/capture-site-chrome.js.
  // Sous 600 px, l'en-tête contient aussi la barre de navigation fixée en bas de l'écran.
  function loadSiteChrome() {
    return Promise.all([fetchText('preview/site/header.html'), fetchText('preview/site/footer.html')])
      .then(function (r) {
        main.parentNode.insertBefore(htmlNode(r[0]), main);
        main.parentNode.insertBefore(htmlNode(r[1]), main.nextSibling);
        initScrollableNav();
        initMobileMenu();
        return loadMenu();
      })
      .catch(function (e) { console.warn('En-tête / pied de page indisponibles :', e.message); });
  }

  // Feuilles de style que Vue injecte après custom.css sur reso.co (thème Vuetify, styles des composants,
  // CSS chargés à la demande), capturées par tools/capture-site-chrome.js. Insérées au même endroit.
  function loadSiteStyles(entry) {
    return fetchText('preview/site/styles.' + entry.type + '.html')
      .then(function (html) { var end = document.getElementById('choix-fin'); end.parentNode.insertBefore(htmlNode(html), end.nextSibling); })
      .catch(function (e) { console.warn('Styles Vue indisponibles :', e.message); });
  }

  // ---------- Menu : généré depuis custom-af-content/menus.yaml ----------
  // Le balisage reproduit celui d'AlumnForce (relevé dans preview/site/header.html), en bureau et en mobile.
  // Sans menus.yaml, le menu capturé est gardé tel quel.
  var lastMenu = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Une URL complète correspond à une entrée « lien externe » d'AlumnForce (balisage différent).
  function isExternal(item) { return /^https?:\/\//.test(item.lien || ''); }
  // Identifiant HTML d'une entrée (<li id="submenu-…">, cible du dépliage mobile #target…) :
  // fabriqué à partir du titre, rendu unique (deux entrées peuvent avoir le même titre).
  // Les identifiants réels d'AlumnForce sont des numéros attribués à la création de l'entrée :
  // pour cibler une entrée dans custom.css, utiliser son lien (a[href="…"]).
  function slug(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entree';
  }
  function assignKeys(items, used) {
    items.forEach(function (item) {
      var base = slug(item.titre), key = base, n = 2;
      while (used[key]) key = base + '-' + n++;
      used[key] = true;
      item._key = key;
      if (children(item)) assignKeys(children(item), used);
    });
  }
  function itemKey(item) { return item._key; }
  function children(item) { var c = item['sous-menu']; return Array.isArray(c) && c.length ? c : null; }

  function desktopMenu(items, level) {
    return items.map(function (item, i) {
      var sub = children(item);
      var cls = sub ? (level === 0 ? 'dropdown' : 'dropdown-submenu') : '';
      var a = isExternal(item)
        ? '<a href="' + esc(item.lien) + '">' + esc(item.titre) + '</a>'
        : '<a href="' + esc(item.lien || '#') + '" class="' + (sub ? 'dropdown-toggle ' : '') + '"' +
          (sub ? ' data-toggle="dropdown"' : '') + '>' + esc(item.titre) + '</a>';
      var ul = '';
      if (sub) {
        // Déduit de reso.co : les entrées de la moitié droite du menu ont leur sous-menu en « pull-left ».
        var pull = level === 0 && i >= Math.floor(items.length / 2) ? 'pull-left' : '';
        ul = '<ul class="dropdown-menu dropdown-list ' + pull + ' level-' + (level + 1) + '">' + desktopMenu(sub, level + 1) + '</ul>';
      }
      return '<li id="submenu-' + esc(itemKey(item)) + '" class="' + cls + '">' + a + ul + '</li>';
    }).join('');
  }

  function mobileMenu(items, level) {
    var linkCls = 'flex-w-max space as-block large cl-gray';
    return items.map(function (item) {
      var sub = children(item);
      var key = esc(itemKey(item));
      var link = '<a href="' + esc(item.lien || '#') + '" class="' + linkCls + '">' + esc(item.titre) + '</a>';
      if (!sub) {
        return '<li id="submenu-' + key + '" class="menu-builder-list">' + (isExternal(item)
          ? '<div class="flex-container flex-ai-center">' + link + '</div>'
          : '<a href="' + esc(item.lien || '#') + '" class="space as-block large cl-gray">' + esc(item.titre) + '</a>') + '</li>';
      }
      return '<li id="submenu-' + key + '" class="' + (level === 0 ? 'dropdown' : 'dropdown-submenu') + ' menu-builder-list">' +
        '<div class="flex-container flex-ai-center">' +
        (isExternal(item) ? link : '<ul class="flex-w-max"><li>' + link + '</li></ul>') +
        '<i target="_self" data-toggle="collapse" data-target="#target' + key + '" class="mdi mdi-chevron-down flex-item-right cl-gray large space space-left-large space-right-large"></i>' +
        '</div>' +
        '<ul id="target' + key + '" class="af-menubuilder-submenu collapse level-' + (level + 1) + '">' + mobileMenu(sub, level + 1) + '</ul>' +
        '</li>';
    }).join('');
  }

  function applyMenu(items) {
    assignKeys(items, {});
    var desktop = document.querySelector('#header .js-scrollable-nav ul.nav');
    var mobile = document.querySelector('#header ul.nav-mobile');
    if (desktop) {
      var container = desktop.parentNode.querySelector('.subContainer');
      if (container) container.replaceChildren();
      desktop.innerHTML = desktopMenu(items, 0);
      desktop.scrollLeft = 0;
    }
    if (mobile) mobile.innerHTML = mobileMenu(items, 0);
    setupDropdowns();
    watchNavSizes();
    syncScrollableNav();
  }

  // Charge menus.yaml (et le recharge en local quand il change). Erreur de syntaxe : signalée, menu inchangé.
  function loadMenu() {
    return fetchContent(CONTENT + 'menus.yaml')
      .catch(function () { return null; })
      .then(function (text) {
        if (text === null) { if (lastMenu === null) setupDropdowns(); lastMenu = ''; return; }
        if (text === lastMenu) return;
        lastMenu = text;
        var items;
        try { items = window.jsyaml.load(text); } catch (e) {
          warnings.menu = ['menus.yaml : ' + e.message.split('\n')[0] + ' (menu non mis à jour)'];
          return notifyWarnings();
        }
        if (!Array.isArray(items)) {
          warnings.menu = ['menus.yaml : le fichier doit être une liste d\'entrées (menu non mis à jour).'];
          return notifyWarnings();
        }
        var bad = [];
        (function check(list, level) {
          list.forEach(function (it) {
            if (!it || typeof it !== 'object' || !it.titre) bad.push('entrée sans titre');
            else if (children(it) && level >= 1 && children(it).some(children)) bad.push('« ' + it.titre + ' » : plus de 3 niveaux (AlumnForce en gère 3)');
            if (it && children(it)) check(children(it), level + 1);
          });
        })(items, 0);
        warnings.menu = bad.map(function (b) { return 'menus.yaml : ' + b; });
        applyMenu(patchMenu(items.filter(function (it) { return it && it.titre; })));
        notifyWarnings();
      })
      .catch(function (e) { console.warn('menus.yaml indisponible :', e.message); setupDropdowns(); });
  }

  // Imite le script AlumnForce des sous-menus du menu bureau, relevé sur reso.co :
  // au chargement, chaque <ul.dropdown-menu> est retiré de son <li> ; au survol du <li>, il est placé
  // dans div.subContainer (hors de la liste qui défile, qui le couperait), sous l'entrée, avec
  // style="top: 0; display: block; left: <position de l'entrée>px" ; il est masqué quand la souris sort.
  // Le 3e niveau (li.dropdown-submenu) s'affiche au survol par le CSS d'AlumnForce.
  var dropdownState = { open: null, timer: null };
  function hideDropdown() {
    if (dropdownState.open) dropdownState.open.style.display = 'none';
    dropdownState.open = null;
  }
  function setupDropdowns() {
    var nav = document.querySelector('#header .js-scrollable-nav');
    var container = nav && nav.querySelector('.subContainer');
    if (!container) return;
    hideDropdown();
    function show(li, menu) {
      clearTimeout(dropdownState.timer);
      if (dropdownState.open && dropdownState.open !== menu) hideDropdown();
      if (menu.parentNode !== container) container.appendChild(menu);
      menu.style.top = '0px';
      menu.style.display = 'block';
      menu.style.left = (li.getBoundingClientRect().left - container.getBoundingClientRect().left) + 'px';
      dropdownState.open = menu;
    }
    function hideSoon() {
      clearTimeout(dropdownState.timer);
      dropdownState.timer = setTimeout(hideDropdown, 150);
    }
    nav.querySelectorAll('ul.nav > li.dropdown').forEach(function (li) {
      var menu = li.querySelector(':scope > ul.dropdown-menu');
      if (!menu) return;
      li.removeChild(menu);
      li.addEventListener('mouseenter', function () { show(li, menu); });
      li.addEventListener('mouseleave', hideSoon);
      menu.addEventListener('mouseenter', function () { clearTimeout(dropdownState.timer); });
      menu.addEventListener('mouseleave', hideSoon);
    });
  }

  // Imite le menu mobile d'AlumnForce, relevé sur reso.co :
  // - bouton « Menu » (☰) : classe « toggled », icône mdi-menu ↔ mdi-close, et #mobile-content-container
  //   / #mobile-menubuilder-content passent de display: none à affichés ;
  // - chevrons (i[data-toggle=collapse]) : repli Bootstrap, ul#target<id> gagne/perd la classe « in »
  //   (height: auto une fois ouvert, 0 une fois fermé).
  function initMobileMenu() {
    var header = document.getElementById('header');
    if (!header) return;
    var button = header.querySelector('#mobile-header a[aria-label="Menu"]');
    var panel = document.getElementById('mobile-content-container');
    var content = document.getElementById('mobile-menubuilder-content');
    if (button && panel) {
      button.addEventListener('click', function (e) {
        e.preventDefault();
        var open = !button.classList.contains('toggled');
        button.classList.toggle('toggled', open);
        var icon = button.querySelector('i.mdi');
        if (icon) { icon.classList.toggle('mdi-menu', !open); icon.classList.toggle('mdi-close', open); }
        panel.style.display = open ? '' : 'none';
        if (content) content.style.display = open ? '' : 'none';
      });
    }
    header.addEventListener('click', function (e) {
      var toggle = e.target.closest('[data-toggle="collapse"][data-target]');
      if (!toggle) return;
      var target = document.querySelector(toggle.getAttribute('data-target'));
      if (!target) return;
      var open = !target.classList.contains('in');
      target.classList.toggle('in', open);
      target.style.height = open ? 'auto' : '0px';
    });
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
  // Recalcule le débordement dès que la taille d'une entrée change (styles, polices, menu régénéré),
  // quel que soit l'ordre dans lequel ils arrivent.
  var navResize = window.ResizeObserver ? new ResizeObserver(function () { syncScrollableNav(); }) : null;
  function watchNavSizes() {
    if (!navResize) return;
    navResize.disconnect();
    document.querySelectorAll('#header .js-scrollable-nav ul.nav > li').forEach(function (li) { navResize.observe(li); });
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
    watchNavSizes();
    syncScrollableNav();
    // Les polices (dont celles importées par custom.css) changent la largeur du menu : recalculer.
    if (document.fonts) {
      document.fonts.ready.then(syncScrollableNav);
      document.fonts.addEventListener('loadingdone', syncScrollableNav);
    }
  }

  // ---------- Navigation ----------
  // Un lien vers une page de l'aperçu (preview/pages.yaml : url, liens) l'affiche dans l'aperçu ;
  // les autres ouvrent reso.co dans un nouvel onglet. Le logo (href="#", le script AlumnForce
  // mène à l'accueil) va à la page dont l'url est « / ».
  var allPages = [];
  function pathOf(href) {
    try {
      var u = new URL(href, ORIGIN + '/');
      if (!/(^|\.)reso\.co$/.test(u.hostname) && u.origin !== location.origin) return null;
      return u.pathname.replace(/\/+$/, '') || '/';
    } catch (e) { return null; }
  }
  function pagePaths(p) { return [p.url].concat(p.liens || []).map(pathOf); }
  function navigate(id) {
    if (window.parent !== window) return notify({ navigate: id });
    var q = new URLSearchParams(location.search);
    q.set('page', id);
    location.search = q.toString();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    var logo = a.querySelector('img.header-dump');
    var path = logo ? '/' : (/^(javascript:|#)/.test(href) ? null : pathOf(href));
    if (path === null) {
      if (/^(javascript:|#)/.test(href)) e.preventDefault();   // boutons de l'en-tête : rien à ouvrir
      return;
    }
    e.preventDefault();
    var target = allPages.find(function (p) { return pagePaths(p).indexOf(path) >= 0; });
    if (target) { if (target.id !== pageId) navigate(target.id); return; }
    window.open(new URL(href, ORIGIN + '/').href, '_blank', 'noopener');
  }, true);

  // Brouillon modifié dans l'éditeur : la visionneuse prévient, l'aperçu se recharge (sans recharger la page)
  var currentEntry = null;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'reso-viewer' || d.type !== 'brouillon' || VERSION !== 'brouillon' || !currentEntry) return;
    load(currentEntry).catch(function (err) { showError(err.message); });
    loadMenu();
  });

  // Raccourcis de la visionneuse (C : comparer, B : basculer), aussi quand l'aperçu a le focus
  document.addEventListener('keydown', function (e) {
    if (window.parent === window || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (/^[cCbB]$/.test(e.key)) notify({ key: e.key.toLowerCase() });
  });

  if (!pageId) return showError('Paramètre ?page= manquant.');

  fetchText('preview/pages.yaml')
    .then(function (text) {
      var r = yamlLoad(text, 'preview/pages.yaml');
      if (r.error) throw new Error(r.error);
      allPages = r.value || [];
      var entry = allPages.find(function (p) { return p.id === pageId; });
      if (!entry) throw new Error('Page « ' + pageId + ' » absente de preview/pages.yaml.');
      if (!document.getElementById('tpl-' + entry.type)) throw new Error('Type de page inconnu dans preview/pages.yaml : « ' + entry.type + ' » (attendu : page-statique ou accueil).');
      if (!entry.contenu) throw new Error('Page « ' + pageId + ' » : « contenu » manquant dans preview/pages.yaml.');
      document.title = entry.titre + ' · aperçu Reso';
      currentEntry = entry;
      // Changement de breakpoint (la visionneuse change la largeur) : autres captures, autres classes Vue.
      var bpName = currentBreakpoint().nom;
      window.addEventListener('resize', function () {
        if (currentBreakpoint().nom === bpName) return;
        bpName = currentBreakpoint().nom;
        load(entry).catch(function (e) { showError(e.message); });
      });
      return loadChoix().then(function () {
        return Promise.all([loadSiteStyles(entry), loadSiteChrome(), load(entry)]);
      }).then(function () {
        // En local : rechargement automatique quand custom.css ou une page change.
        if (isLocal) setInterval(function () {
          load(entry).catch(function () {});
          loadMenu();
        }, 1500);
      });
    })
    .catch(function (e) { showError(e.message); });
})();
