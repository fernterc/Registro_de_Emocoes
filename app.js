/* =========================================================
   Registro de Emoções — lógica do app
   Dados salvos apenas neste aparelho (localStorage).
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Constantes ---------- */
  var STORAGE_KEY = 'registro_emocoes_v1';
  var AREA_COLORS = {
    'Saúde': '#6F9A82',
    'Relacionamentos': '#B97D82',
    'Performance': '#C09A5B',
    'Lazer': '#7A9DB5',
    'Finanças': '#8A7FB0',
    'Outros': '#9AA39A'
  };
  var WEEKDAYS_SHORT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var WEEKDAYS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var WEDNESDAY = 3;
  var TEXT_FIELDS = ['situacao', 'pensamentos', 'emocoes', 'comportamentos'];
  var AWAY_MS = 5 * 60 * 1000; // tempo fora do app para contar como "abrir de novo"

  /* ---------- Helpers de data (sempre datas locais, formato AAAA-MM-DD) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); }
  function todayISO() { return toISO(new Date()); }
  function addDays(iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function brDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function longDate(iso) { var d = fromISO(iso); return d.getDate() + ' de ' + MONTHS[d.getMonth()] + ' de ' + d.getFullYear(); }
  function lastWednesdayOnOrBefore(iso) {
    var d = fromISO(iso); d.setDate(d.getDate() - ((d.getDay() - WEDNESDAY + 7) % 7)); return toISO(d);
  }
  function nextWednesdayAfter(iso) {
    var d = fromISO(iso); var diff = (WEDNESDAY - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff); return toISO(d);
  }

  /* ---------- Atalhos de DOM ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- Estado persistido ---------- */
  function defaults() {
    return { version: 1, entries: [], lastExport: null, snoozeUntil: null, firstUse: todayISO(), draft: null };
  }
  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var s = Object.assign(defaults(), parsed);
        if (!Array.isArray(s.entries)) s.entries = [];
        return s;
      }
    } catch (e) {
      // Dados ilegíveis: guarda uma cópia antes de recomeçar, para nunca perder nada em silêncio.
      try { if (raw) localStorage.setItem(STORAGE_KEY + '_corrompido', raw); } catch (e2) {}
    }
    return defaults();
  }
  var state = load();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (e) { toast('Não foi possível salvar. Verifique o espaço do navegador.'); return false; }
  }

  /* ---------- Estado de tela (não persistido) ---------- */
  var view = {
    date: todayISO(),
    screen: 'day',
    editingId: null,
    bannerClosed: false,
    dayScroll: 0,
    hiddenAt: null,
    todayAtHide: null
  };
  var entryInitial = emptyValues();
  var ignorePop = false;

  function emptyValues() { return { area: '', situacao: '', pensamentos: '', emocoes: '', comportamentos: '' }; }
  function pickValues(e) {
    return { area: e.area || '', situacao: e.situacao || '', pensamentos: e.pensamentos || '', emocoes: e.emocoes || '', comportamentos: e.comportamentos || '' };
  }
  function findEntry(id) { for (var i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return state.entries[i]; return null; }
  function sortEntries(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  function entriesOf(iso) { return sortEntries(state.entries.filter(function (e) { return e.date === iso; })); }
  function markedDates() { var s = {}; state.entries.forEach(function (e) { s[e.date] = true; }); return s; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3400);
  }

  /* ---------- Confirmação ---------- */
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      $('confirmTitle').textContent = o.title;
      $('confirmText').textContent = o.text;
      $('confirmYes').textContent = o.yes || 'Confirmar';
      $('confirmModal').hidden = false;
      $('confirmNo').focus();
      function done(v) {
        $('confirmModal').hidden = true;
        $('confirmYes').onclick = null; $('confirmNo').onclick = null;
        resolve(v);
      }
      $('confirmYes').onclick = function () { done(true); };
      $('confirmNo').onclick = function () { done(false); };
      $('confirmModal').onclick = function (e) { if (e.target === $('confirmModal')) done(false); };
    });
  }

  /* =========================================================
     CALENDÁRIO (usado no seletor de data e na exportação)
     ========================================================= */
  function createCalendar(mount, opts) {
    var mode = opts.mode; // 'single' | 'range'
    var now = new Date();
    var viewY = now.getFullYear(), viewM = now.getMonth();
    var selStart = null, selEnd = null;

    function render() {
      var marks = markedDates();
      var t = todayISO();
      var first = new Date(viewY, viewM, 1, 12);
      var offset = first.getDay();
      var total = new Date(viewY, viewM + 1, 0).getDate();
      var lo = selStart, hi = selStart ? (selEnd || selStart) : null;

      var minY = Math.min(2020, viewY, now.getFullYear());
      state.entries.forEach(function (e) { var y = Number(e.date.slice(0, 4)); if (y < minY) minY = y; });
      var maxY = Math.max(now.getFullYear() + 1, viewY);

      var h = '<div class="cal-head">' +
        '<button type="button" class="cal-nav" data-nav="-1" aria-label="Mês anterior"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="cal-sel"><select data-sel="month" aria-label="Mês">';
      MONTHS.forEach(function (m, i) { h += '<option value="' + i + '"' + (i === viewM ? ' selected' : '') + '>' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>'; });
      h += '</select><select data-sel="year" aria-label="Ano">';
      for (var y = minY; y <= maxY; y++) h += '<option value="' + y + '"' + (y === viewY ? ' selected' : '') + '>' + y + '</option>';
      h += '</select></div>' +
        '<button type="button" class="cal-nav" data-nav="1" aria-label="Próximo mês"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';

      h += '<div class="cal-week" aria-hidden="true">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>';
      h += '<div class="cal-grid">';
      for (var i = 0; i < offset; i++) h += '<div class="cal-cell"></div>';
      for (var d = 1; d <= total; d++) {
        var iso = viewY + '-' + pad(viewM + 1) + '-' + pad(d);
        var cls = 'cal-day';
        var cellCls = 'cal-cell';
        if (iso === t) cls += ' today';
        if (marks[iso]) cls += ' marked';
        if (lo) {
          if (mode === 'single') {
            if (iso === lo) cls += ' selected';
          } else {
            if (iso === lo) cls += ' range-start';
            if (iso === hi) cls += ' range-end';
            if (iso > lo && iso < hi) cls += ' in-range';
            if (hi > lo && iso === lo) cellCls += ' rs';
            if (hi > lo && iso === hi) cellCls += ' re';
          }
        }
        var label = d + ' de ' + MONTHS[viewM] + ' de ' + viewY + (marks[iso] ? ', com registros' : '');
        h += '<div class="' + cellCls + '"><button type="button" class="' + cls + '" data-date="' + iso + '" aria-label="' + label + '">' + d + '</button></div>';
      }
      h += '</div>';
      mount.innerHTML = h;
    }

    mount.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        viewM += Number(nav.getAttribute('data-nav'));
        if (viewM < 0) { viewM = 11; viewY--; }
        if (viewM > 11) { viewM = 0; viewY++; }
        render();
        return;
      }
      var day = e.target.closest('[data-date]');
      if (!day) return;
      var iso = day.getAttribute('data-date');
      if (mode === 'single') {
        selStart = iso; selEnd = null; render(); opts.onChange(iso);
      } else {
        if (!selStart || selEnd) { selStart = iso; selEnd = null; }
        else if (iso < selStart) { selEnd = selStart; selStart = iso; }
        else { selEnd = iso; }
        render();
        opts.onChange(selStart, selEnd || selStart);
      }
    });
    mount.addEventListener('change', function (e) {
      var sel = e.target.closest('[data-sel]');
      if (!sel) return;
      if (sel.getAttribute('data-sel') === 'month') viewM = Number(sel.value);
      else viewY = Number(sel.value);
      render();
    });

    return {
      render: render,
      setSelection: function (a, b) {
        selStart = a; selEnd = b && b !== a ? b : (b === a ? a : null);
        var ref = fromISO(b || a || todayISO());
        viewY = ref.getFullYear(); viewM = ref.getMonth();
        render();
      }
    };
  }

  /* =========================================================
     TELA DO DIA
     ========================================================= */
  function buildCard(e) {
    var card = el('button', 'card');
    card.type = 'button';
    card.setAttribute('data-id', e.id);

    var top = el('span', 'card-top');
    var area = el('span', 'area');
    var dot = el('i', 'area-dot');
    if (AREA_COLORS[e.area]) dot.style.background = AREA_COLORS[e.area];
    area.appendChild(dot);
    area.appendChild(document.createTextNode(e.area || 'Sem área'));
    top.appendChild(area);
    var tm = new Date(e.createdAt || Date.now());
    top.appendChild(el('span', 'time', pad(tm.getHours()) + ':' + pad(tm.getMinutes())));
    card.appendChild(top);

    var rows = [['Situação', e.situacao], ['Emoções', e.emocoes], ['Pensamentos automáticos', e.pensamentos]];
    var shown = 0;
    rows.forEach(function (r) {
      if (!r[1] || !r[1].trim()) return;
      var p = el('span', 'pv');
      p.appendChild(el('span', 'pv-label', r[0]));
      p.appendChild(el('span', 'pv-text', r[1]));
      card.appendChild(p);
      shown++;
    });
    if (!shown && e.comportamentos && e.comportamentos.trim()) {
      var p2 = el('span', 'pv');
      p2.appendChild(el('span', 'pv-label', 'Comportamentos'));
      p2.appendChild(el('span', 'pv-text', e.comportamentos));
      card.appendChild(p2);
    }
    return card;
  }

  function renderDay() {
    var d = fromISO(view.date);
    $('dayName').textContent = WEEKDAYS_SHORT[d.getDay()];
    $('dayDate').textContent = longDate(view.date);
    var isToday = view.date === todayISO();
    $('todayTag').hidden = !isToday;
    $('btnGoToday').hidden = isToday;

    var box = $('cards');
    box.textContent = '';
    var list = entriesOf(view.date);
    if (!list.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('p', 'empty-title', 'Nenhum registro neste dia'));
      empty.appendChild(el('p', 'empty-text', 'Toque no botão + para registrar uma situação.'));
      box.appendChild(empty);
    } else {
      list.forEach(function (e) { box.appendChild(buildCard(e)); });
    }
    renderBanner();
  }

  /* ---------- Navegação entre dias ---------- */
  function slideTitle(dir) {
    var t = $('btnPickDate');
    t.style.transform = ''; t.style.opacity = '';
    if (t.animate && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      t.animate([{ transform: 'translateX(' + (dir * 36) + 'px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 200, easing: 'ease-out' });
    }
  }
  function goToDate(iso, dir) {
    view.date = iso;
    renderDay();
    slideTitle(dir || 0);
  }
  function stepDay(n) { goToDate(addDays(view.date, n), n); }

  function setupSwipe() {
    var zone = $('swipeZone');
    var title = $('btnPickDate');
    var startX = 0, startY = 0, dx = 0, active = false, moved = false, suppress = false;

    zone.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX; startY = e.clientY; dx = 0; active = true; moved = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
    function onMove(e) {
      if (!active) return;
      dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { moved = true; zone.classList.add('dragging'); }
      if (moved) {
        var shift = Math.max(-80, Math.min(80, dx * 0.6));
        title.style.transform = 'translateX(' + shift + 'px)';
        title.style.opacity = String(1 - Math.min(Math.abs(dx) / 300, 0.4));
      }
    }
    function end() {
      active = false;
      zone.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }
    function onUp() {
      var wasMoved = moved, delta = dx;
      end();
      if (!wasMoved) return;
      suppress = true; setTimeout(function () { suppress = false; }, 350);
      title.style.transform = ''; title.style.opacity = '';
      if (Math.abs(delta) >= 50) stepDay(delta < 0 ? 1 : -1); // arrastar para a esquerda avança
    }
    function onCancel() { end(); title.style.transform = ''; title.style.opacity = ''; }
    // Um arrasto não pode abrir o calendário
    zone.addEventListener('click', function (e) { if (suppress) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* ---------- Seletor de data ---------- */
  var dayCal = null;
  function openCal() {
    dayCal.setSelection(view.date);
    $('calModal').hidden = false;
  }
  function closeCal() { $('calModal').hidden = true; }

  /* =========================================================
     LEMBRETE DE EXPORTAÇÃO (quartas-feiras)
     ========================================================= */
  function reminderDue() {
    if (!state.entries.length) return null;
    var t = todayISO();
    if (state.snoozeUntil && t < state.snoozeUntil) return null;
    var w = lastWednesdayOnOrBefore(t);
    if (w < state.firstUse) return null;
    if (state.lastExport && state.lastExport >= w) return null;
    return w;
  }
  function renderBanner() {
    var w = view.bannerClosed ? null : reminderDue();
    var b = $('banner');
    if (!w) { b.hidden = true; return; }
    $('bannerText').textContent = (w === todayISO())
      ? 'Hoje é quarta-feira, dia de exportar seus registros.'
      : 'Você ainda não exportou seus registros desde quarta-feira (' + brDate(w).slice(0, 5) + ').';
    b.hidden = false;
  }

  /* =========================================================
     TELAS E HISTÓRICO
     ========================================================= */
  function showScreen(name) {
    if (view.screen === 'day') view.dayScroll = window.scrollY || 0;
    view.screen = name;
    ['day', 'entry', 'export'].forEach(function (n) { $('screen-' + n).hidden = (n !== name); });
    window.scrollTo(0, name === 'day' ? view.dayScroll : 0);
  }
  function pushScreen(name) {
    try { history.pushState({ s: name }, ''); } catch (e) {}
    showScreen(name);
  }
  function backToDay() {
    if (history.state && history.state.s && history.state.s !== 'day') {
      ignorePop = true;
      setTimeout(function () { ignorePop = false; }, 600);
      try { history.back(); } catch (e) { ignorePop = false; }
    }
    showScreen('day');
    renderDay();
  }
  window.addEventListener('popstate', function () {
    if (ignorePop) { ignorePop = false; return; }
    if (view.screen === 'entry') {
      try { history.pushState({ s: 'entry' }, ''); } catch (e) {}
      requestCloseEntry();
    } else if (view.screen === 'export') {
      showScreen('day'); renderDay();
    }
  });

  /* =========================================================
     TELA DE REGISTRO
     ========================================================= */
  var F = {
    area: $('f-area'),
    situacao: $('f-situacao'),
    pensamentos: $('f-pensamentos'),
    emocoes: $('f-emocoes'),
    comportamentos: $('f-comportamentos')
  };
  function readForm() {
    return { area: F.area.value, situacao: F.situacao.value, pensamentos: F.pensamentos.value, emocoes: F.emocoes.value, comportamentos: F.comportamentos.value };
  }
  function fillForm(v) { Object.keys(F).forEach(function (k) { F[k].value = v[k] || ''; }); }
  function autosize(t) {
    var y = window.scrollY;
    t.style.height = 'auto';
    t.style.height = (t.scrollHeight + 3) + 'px';
    if (window.scrollY !== y) window.scrollTo(0, y);
  }
  function autosizeAll() { TEXT_FIELDS.forEach(function (k) { autosize(F[k]); }); }
  function isDirty() {
    var a = readForm();
    return Object.keys(a).some(function (k) { return String(a[k]).trim() !== String(entryInitial[k] || '').trim(); });
  }

  function openEntry(id, draftValues) {
    view.editingId = id || null;
    var e = id ? findEntry(id) : null;
    entryInitial = e ? pickValues(e) : emptyValues();
    fillForm(draftValues || entryInitial);
    $('entryTitle').textContent = e ? 'Editar registro' : 'Novo registro';
    var d = fromISO(view.date);
    $('entrySub').textContent = WEEKDAYS_SHORT[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
    $('entryDelete').hidden = !e;
    $('formError').hidden = true;
    pushScreen('entry');
    autosizeAll();
  }

  var draftTimer = null;
  function persistDraft() {
    clearTimeout(draftTimer); draftTimer = null;
    if (view.screen !== 'entry') return;
    state.draft = isDirty() ? { date: view.date, id: view.editingId, values: readForm() } : null;
    save();
  }
  function discardDraft() {
    clearTimeout(draftTimer); draftTimer = null;
    if (state.draft) { state.draft = null; save(); }
  }

  // Importante: este handler só atualiza o tamanho do campo e agenda o rascunho.
  // Nunca recria o DOM do formulário, para não fechar o teclado do celular.
  function onFormInput(e) {
    if (e && e.target && e.target.tagName === 'TEXTAREA') autosize(e.target);
    if (!$('formError').hidden) $('formError').hidden = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDraft, 400);
  }

  function requestCloseEntry() {
    if (isDirty()) {
      return confirmDialog({ title: 'Descartar alterações?', text: 'O que você escreveu neste registro será perdido.', yes: 'Descartar' }).then(function (ok) {
        if (ok) { discardDraft(); backToDay(); }
      });
    }
    discardDraft();
    backToDay();
    return Promise.resolve();
  }

  function saveEntry() {
    var v = readForm();
    var hasText = TEXT_FIELDS.some(function (k) { return v[k].trim() !== ''; });
    if (!hasText) {
      var err = $('formError');
      err.textContent = 'Escreva em pelo menos um dos campos para salvar.';
      err.hidden = false;
      return;
    }
    TEXT_FIELDS.forEach(function (k) { v[k] = v[k].trim(); });
    var e = view.editingId ? findEntry(view.editingId) : null;
    if (e) {
      Object.assign(e, v, { updatedAt: Date.now() });
    } else {
      state.entries.push(Object.assign({ id: newId(), date: view.date, createdAt: Date.now() }, v));
    }
    clearTimeout(draftTimer); draftTimer = null;
    state.draft = null;
    save();
    backToDay();
    toast('Registro salvo.');
  }

  function deleteEntry() {
    var id = view.editingId;
    if (!id) return;
    confirmDialog({ title: 'Excluir este registro?', text: 'Essa ação não pode ser desfeita.', yes: 'Excluir' }).then(function (ok) {
      if (!ok) return;
      state.entries = state.entries.filter(function (e) { return e.id !== id; });
      clearTimeout(draftTimer); draftTimer = null;
      state.draft = null;
      save();
      backToDay();
      toast('Registro excluído.');
    });
  }

  /* =========================================================
     EXPORTAÇÃO
     ========================================================= */
  var xp = { all: false, start: null, end: null, preset: null };
  var exportCal = null;

  function applyPreset(p) {
    var t = todayISO();
    xp.preset = p;
    if (p === '7d') { xp.start = addDays(t, -6); xp.end = t; }
    else if (p === 'month') { xp.start = t.slice(0, 8) + '01'; xp.end = t; }
    else if (p === 'since' && state.lastExport) { xp.start = state.lastExport; xp.end = t; }
    exportCal.setSelection(xp.start, xp.end);
  }

  function selectedEntries() {
    var list = state.entries;
    if (!xp.all) list = list.filter(function (e) { return e.date >= xp.start && e.date <= xp.end; });
    return sortEntries(list);
  }
  function periodLabel() {
    if (xp.all) return 'Todos os registros';
    return xp.start === xp.end ? brDate(xp.start) : brDate(xp.start) + ' a ' + brDate(xp.end);
  }

  function updateExportUI() {
    $('exportAll').checked = xp.all;
    $('rangeBlock').classList.toggle('disabled', xp.all);
    $('chipSince').hidden = !state.lastExport;
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.classList.toggle('active', !xp.all && c.getAttribute('data-range') === xp.preset);
    });
    var list = selectedEntries();
    var days = {}; list.forEach(function (e) { days[e.date] = true; });
    var nd = Object.keys(days).length;
    $('sumPeriod').textContent = periodLabel();
    $('sumCount').textContent = list.length
      ? list.length + (list.length === 1 ? ' registro' : ' registros') + ' em ' + nd + (nd === 1 ? ' dia' : ' dias')
      : 'Nenhum registro neste período.';
    $('btnDownload').disabled = !list.length;
    $('btnShare').disabled = !list.length;
  }

  function openExport() {
    xp.all = false;
    applyPreset(state.lastExport ? 'since' : '7d');
    pushScreen('export');
    updateExportUI();
  }

  /* ---------- PDF ---------- */
  var droppedChars = false;
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  // O PDF usa a fonte padrão (Latin-1). Emojis e símbolos fora dela são omitidos.
  function pdfSafe(s) {
    s = String(s == null ? '' : s).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\u2028|\u2029/g, '\n').replace(/\t/g, '  ');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) out += ch;
      else if (c === 0x200B || c === 0x200D || (c >= 0xFE00 && c <= 0xFE0F)) { /* caracteres invisíveis: ignorar */ }
      else if (c >= 0xDC00 && c <= 0xDFFF) { /* segunda metade de um emoji: já contado */ }
      else droppedChars = true;
    }
    return out;
  }

  function buildPdf(entries, label) {
    droppedChars = false;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    try { doc.setLanguage('pt-BR'); } catch (e) {}
    var margin = 12;
    var pageH = doc.internal.pageSize.getHeight();
    var pageW = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(43, 55, 46);
    doc.text(pdfSafe('Registro de emoções'), margin, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(94, 107, 96);
    doc.text(pdfSafe(label + '   |   Gerado em ' + brDate(todayISO())), margin, 22);

    var byDay = {}, order = [];
    entries.forEach(function (e) { if (!byDay[e.date]) { byDay[e.date] = []; order.push(e.date); } byDay[e.date].push(e); });

    var y = 31;
    order.forEach(function (iso) {
      if (y > pageH - 48) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(43, 55, 46);
      doc.text(pdfSafe(WEEKDAYS_FULL[fromISO(iso).getDay()] + ', ' + brDate(iso)), margin, y);
      var body = byDay[iso].map(function (e) {
        return [e.area || '-', e.situacao || '-', e.pensamentos || '-', e.emocoes || '-', e.comportamentos || '-'].map(pdfSafe);
      });
      doc.autoTable({
        startY: y + 3,
        head: [['Área da vida', 'Situação', 'Pensamentos automáticos', 'Emoções', 'Comportamentos'].map(pdfSafe)],
        body: body,
        theme: 'grid',
        margin: { left: margin, right: margin, top: 16, bottom: 14 },
        tableWidth: pageW - margin * 2,
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.6, textColor: [43, 55, 46], lineColor: [222, 227, 214], lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: [78, 107, 93], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 244, 236] },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 60 }, 2: { cellWidth: 65 }, 3: { cellWidth: 50 }, 4: { cellWidth: 70 } },
        rowPageBreak: 'avoid',
        showHead: 'everyPage'
      });
      y = doc.lastAutoTable.finalY + 11;
    });

    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(147, 160, 146);
      doc.text(pdfSafe('Página ' + p + ' de ' + pages), pageW - margin, pageH - 6, { align: 'right' });
    }

    var name = xp.all
      ? 'registro-emocoes_completo_' + todayISO() + '.pdf'
      : 'registro-emocoes_' + xp.start + (xp.end !== xp.start ? '_a_' + xp.end : '') + '.pdf';
    return { blob: doc.output('blob'), filename: name, dropped: droppedChars };
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  function markExported() {
    state.lastExport = todayISO();
    state.snoozeUntil = null;
    save();
    view.bannerClosed = false;
  }

  function doDownload() {
    var list = selectedEntries();
    if (!list.length) return;
    try {
      var r = buildPdf(list, periodLabel());
      downloadBlob(r.blob, r.filename);
      markExported();
      toast(r.dropped ? 'PDF baixado. Emojis e símbolos especiais não aparecem no PDF.' : 'PDF baixado.');
      updateExportUI();
    } catch (err) {
      console.error(err);
      toast('Não foi possível gerar o PDF. Tente novamente.');
    }
  }

  function doShare() {
    var list = selectedEntries();
    if (!list.length) return;
    var r;
    try { r = buildPdf(list, periodLabel()); }
    catch (err) { console.error(err); toast('Não foi possível gerar o PDF. Tente novamente.'); return; }
    var file = null;
    try { file = new File([r.blob], r.filename, { type: 'application/pdf' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Registro de emoções' }).then(function () {
        markExported(); updateExportUI();
        toast(r.dropped ? 'Compartilhado. Emojis e símbolos especiais não aparecem no PDF.' : 'PDF compartilhado.');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return; // a pessoa fechou o menu de compartilhar
        downloadBlob(r.blob, r.filename); markExported(); updateExportUI();
        toast('Não foi possível compartilhar; o PDF foi baixado.');
      });
    } else {
      downloadBlob(r.blob, r.filename); markExported(); updateExportUI();
      toast('Este aparelho não compartilha arquivos por aqui; o PDF foi baixado.');
    }
  }

  /* =========================================================
     EVENTOS
     ========================================================= */
  function bind() {
    $('btnPrev').addEventListener('click', function () { stepDay(-1); });
    $('btnNext').addEventListener('click', function () { stepDay(1); });
    $('btnPickDate').addEventListener('click', openCal);
    $('btnGoToday').addEventListener('click', function () {
      var t = todayISO(); goToDate(t, t > view.date ? 1 : -1);
    });
    setupSwipe();

    dayCal = createCalendar($('calMount'), {
      mode: 'single',
      onChange: function (iso) { var dir = iso > view.date ? 1 : -1; closeCal(); goToDate(iso, dir); }
    });
    $('calToday').addEventListener('click', function () { var t = todayISO(); closeCal(); goToDate(t, t > view.date ? 1 : -1); });
    $('calClose').addEventListener('click', closeCal);
    $('calModal').addEventListener('click', function (e) { if (e.target === $('calModal')) closeCal(); });

    $('cards').addEventListener('click', function (e) {
      var c = e.target.closest('.card');
      if (c) openEntry(c.getAttribute('data-id'));
    });
    $('fab').addEventListener('click', function () { openEntry(null); });

    // Lembrete
    $('bannerClose').addEventListener('click', function () { view.bannerClosed = true; renderBanner(); });
    $('bannerExport').addEventListener('click', openExport);
    $('bannerSnooze').addEventListener('click', function () {
      state.snoozeUntil = nextWednesdayAfter(todayISO());
      save(); renderBanner();
      toast('Combinado. Vou lembrar na quarta-feira, ' + brDate(state.snoozeUntil).slice(0, 5) + '.');
    });

    // Formulário
    $('entryForm').addEventListener('input', onFormInput);
    $('entryForm').addEventListener('change', onFormInput);
    $('entryForm').addEventListener('submit', function (e) { e.preventDefault(); saveEntry(); });
    $('entrySaveTop').addEventListener('click', saveEntry);
    $('entryBack').addEventListener('click', requestCloseEntry);
    $('entryDelete').addEventListener('click', deleteEntry);

    // Exportação
    $('btnExport').addEventListener('click', openExport);
    $('exportBack').addEventListener('click', backToDay);
    exportCal = createCalendar($('exportCal'), {
      mode: 'range',
      onChange: function (a, b) { xp.start = a; xp.end = b; xp.preset = null; updateExportUI(); }
    });
    $('exportAll').addEventListener('change', function () { xp.all = this.checked; updateExportUI(); });
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.addEventListener('click', function () { applyPreset(c.getAttribute('data-range')); updateExportUI(); });
    });
    $('btnDownload').addEventListener('click', doDownload);
    if (navigator.share) { $('btnShare').hidden = false; $('btnShare').addEventListener('click', doShare); }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('confirmModal').hidden) $('confirmNo').click();
      else if (!$('calModal').hidden) closeCal();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (view.screen === 'entry') persistDraft(); // garante que o rascunho foi salvo
        view.hiddenAt = Date.now(); view.todayAtHide = todayISO();
      } else if (view.hiddenAt && Date.now() - view.hiddenAt > AWAY_MS) {
        view.bannerClosed = false;
        if (view.screen === 'day' && todayISO() !== view.todayAtHide) view.date = todayISO();
        if (view.screen === 'day') renderDay();
      }
    });
  }

  /* =========================================================
     INICIAR
     ========================================================= */
  function init() {
    bind();
    save(); // grava "firstUse" na primeira abertura
    history.replaceState({ s: 'day' }, '');
    renderDay();

    // Recupera um registro que estava sendo escrito quando o app foi fechado
    var d = state.draft;
    if (d && d.values) {
      view.date = d.date || view.date;
      renderDay();
      openEntry(d.id && findEntry(d.id) ? d.id : null, d.values);
      toast('Recuperei o registro que você estava escrevendo.');
    }

    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }
  init();
})();
