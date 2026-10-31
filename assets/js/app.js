/* ============================================================
   《我们能做多久的好朋友？》— 应用层
   路由 / 十个章节 / 答题 / 结果 / 雷达图 / 情景 / 寄语 / 纪念卡
   ============================================================ */
(function (root, doc) {
  'use strict';

  var FJ = root.FJ;
  var QS = FJ.QUESTIONS;
  var DIMS = FJ.DIMS;
  var STORY = FJ.STORY;
  var N = QS.length;
  var VIEWS = ['home', 'story', 'test', 'result', 'futures', 'letter', 'card'];
  var TITLES = {
    home: '我们能做多久的好朋友？——一场关于友情、相遇、距离与未来的计算',
    story: '十个章节 · 我们能做多久的好朋友？',
    test: '测试 · 我们能做多久的好朋友？',
    result: '结果 · 我们能做多久的好朋友？',
    futures: '未来 · 我们能做多久的好朋友？',
    letter: '致 张应钰 · 我们能做多久的好朋友？',
    card: '纪念卡 · 我们能做多久的好朋友？'
  };

  var STORE_KEY = 'fjq.state.v2';
  var LEGACY_KEYS = ['fjq.state.v1'];
  var SESSION_INTRO = 'fjq.intro.seen';

  var state = { v: 2, answers: {}, cursor: 0, updatedAt: 0, done: false, viewer: null, memory: '' };
  var route = 'home';
  var routeParam = null;
  var scenActive = 'keep';
  var storageBroken = false;
  var advanceTimer = null;
  var letterBuilt = false;
  var letterOpened = false;
  var activeLetter = 1;
  var cardDate = '';

  /* ---------------- 工具 ---------------- */
  function $(sel, scope) { return (scope || doc).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function reduceMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 2800);
  }

  /* ---------------- 人物与称呼 ---------------- */
  function viewerInfo() {
    if (state.viewer === 'maker') {
      return { me: FJ.PEOPLE.maker.name, cp: FJ.PEOPLE.receiver.name, ta: FJ.PEOPLE.receiver.ta };
    }
    if (state.viewer === 'receiver') {
      return { me: FJ.PEOPLE.receiver.name, cp: FJ.PEOPLE.maker.name, ta: FJ.PEOPLE.maker.ta };
    }
    return { me: '填写者', cp: '对方', ta: '对方' };
  }
  function fmt(str) {
    var v = viewerInfo();
    return String(str)
      .replace(/\{cp\}/g, v.cp)
      .replace(/\{ta\}/g, v.ta)
      .replace(/\{me\}/g, v.me);
  }

  /* ---------------- 存储 ---------------- */
  function load() {
    LEGACY_KEYS.forEach(function (k) {
      try { if (localStorage.getItem(k)) localStorage.removeItem(k); } catch (e) {}
    });
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (!obj || obj.v !== 2 || typeof obj.answers !== 'object' || !obj.answers) return;

      var clean = {};
      QS.forEach(function (q) {
        var idx = obj.answers[q.id];
        if (typeof idx === 'number' && idx >= 0 && idx <= q.options.length) clean[q.id] = idx;
      });
      state.answers = clean;
      var cur = typeof obj.cursor === 'number' ? Math.floor(obj.cursor) : 0;
      state.cursor = Math.min(Math.max(cur, 0), N - 1);
      state.done = !!obj.done;
      state.updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0;
      state.viewer = (obj.viewer === 'maker' || obj.viewer === 'receiver') ? obj.viewer : null;
      state.memory = typeof obj.memory === 'string' ? obj.memory.slice(0, 400) : '';
    } catch (e) {
      markStorageBroken(false);
      state = { v: 2, answers: {}, cursor: 0, updatedAt: 0, done: false, viewer: null, memory: '' };
    }
  }

  function showStorageBanner() {
    var w = $('#storage-warn');
    if (w) w.hidden = false;
  }
  function markStorageBroken(notify) {
    var first = !storageBroken;
    storageBroken = true;
    showStorageBanner();
    if (first && notify) toast('这个浏览器不允许保存数据，刷新或关掉页面后答案会丢失');
  }
  function save() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      markStorageBroken(true);
    }
  }
  function clearSaved() {
    state.answers = {};
    state.cursor = 0;
    state.done = false;
    state.memory = '';
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ---------------- 状态查询 ---------------- */
  function answeredCount() {
    return QS.filter(function (q) { return typeof state.answers[q.id] === 'number'; }).length;
  }
  function allAnswered() { return answeredCount() === N; }
  function firstUnanswered() {
    for (var i = 0; i < N; i++) if (typeof state.answers[QS[i].id] !== 'number') return i;
    return -1;
  }
  function currentResult() { return FJ.engine.compute(state.answers); }

  /* ---------------- 路由 ---------------- */
  function parseRoute() {
    var raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    var parts = raw.split('/').filter(Boolean);
    var view = parts[0] || 'home';
    if (VIEWS.indexOf(view) < 0) return { view: 'home', param: null };
    return { view: view, param: parts[1] || null };
  }

  function go(target, replace, param) {
    var hash = '#/' + target + (param ? '/' + param : '');
    if (location.hash === hash) { render(target, param); return; }
    if (replace) location.replace(hash);
    else location.hash = hash;
  }

  function render(target, param) {
    /* 纪念卡不要求先做完测试：没做也能生成一张只留姓名、日期与那句话的卡片 */
    if ((target === 'result' || target === 'futures') && !allAnswered()) {
      if (location.hash !== '#/test') location.replace('#/test');
      else render('test');
      setTimeout(function () { toast('先把 20 道题答完，才有可以计算的东西'); }, 200);
      return;
    }

    clearTimeout(advanceTimer);
    advanceTimer = null;

    /* 换页时清掉上一条提示：否则会出现"页面已经过去、提示还在说不能进"的矛盾 */
    var oldToast = $('#toast');
    if (oldToast) oldToast.classList.remove('is-on');

    /* 首页首帧不播放入场动画（避免任何位移）；一旦离开首页就解除标记，
       这样之后再回到首页仍然有淡入。 */
    if (target !== 'home') {
      var hv = $('#view-home');
      if (hv && hv.classList.contains('is-static')) hv.classList.remove('is-static');
    }

    route = target;
    routeParam = param || null;
    doc.body.setAttribute('data-view', target);
    doc.title = TITLES[target] || TITLES.home;

    $$('.view').forEach(function (v) {
      var on = v.getAttribute('data-view') === target;
      v.hidden = !on;
      if (on) v.classList.add('is-active'); else v.classList.remove('is-active');
    });

    $$('.steps a').forEach(function (a) {
      var step = a.getAttribute('data-step');
      var needAnswers = step === 'result' || step === 'futures';
      var locked = needAnswers && !allAnswered();
      a.classList.toggle('is-on', step === target);
      a.classList.toggle('is-locked', locked);
      if (step === target) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
      /* 这里不用 aria-disabled：链接仍然可以点，点了会解释原因，
         标成 disabled 反而会与真实行为矛盾（读屏与自动化都会当成不可点）。 */
      if (locked) a.setAttribute('title', '先答完 20 道题才有内容');
      else a.removeAttribute('title');
    });

    if (target === 'home') renderHome();
    if (target === 'story') renderStory(routeParam);
    if (target === 'test') renderTest();
    if (target === 'result') renderResult();
    if (target === 'futures') renderFutures();
    if (target === 'letter') renderLetter(true);
    if (target === 'card') renderCard();

    root.scrollTo(0, 0);

    if (target !== 'test') {
      var h = $('.view.is-active .view-title, .view.is-active .home-title, .view.is-active .chapter-title');
      if (h) {
        h.setAttribute('tabindex', '-1');
        try { h.focus({ preventScroll: true }); } catch (e) {}
      }
    }
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var box = $('#home-resume');
    var done = answeredCount();

    box.innerHTML = '';
    if (storageBroken) {
      box.hidden = true;
      return;
    }
    if (done > 0 && done < N) {
      box.hidden = false;
      box.appendChild(doc.createTextNode('上次你答了 ' + done + ' 题，还剩 ' + (N - done) + ' 题。'));
      var b = el('button', 'link-btn', '接着答');
      b.type = 'button';
      b.addEventListener('click', function () {
        var i = firstUnanswered();
        state.cursor = i < 0 ? 0 : i;
        save();
        go('test');
      });
      box.appendChild(b);
    } else if (done === N) {
      box.hidden = false;
      box.appendChild(doc.createTextNode('你上次已经答完了，可以直接看结果。'));
      var b2 = el('button', 'link-btn', '看结果');
      b2.type = 'button';
      b2.addEventListener('click', function () { go('result'); });
      box.appendChild(b2);
    } else {
      box.hidden = true;
    }
  }

  function renderHomeChapters() {
    var box = $('#home-chapters');
    if (!box) return;
    box.innerHTML = '';
    STORY.forEach(function (ch, i) {
      var a = el('a', 'chapter-chip');
      a.href = '#/story/' + (i + 1);
      a.appendChild(el('span', 'chapter-chip-no', ch.no));
      a.appendChild(el('span', 'chapter-chip-title', ch.title));
      box.appendChild(a);
    });
  }

  /* ---------------- 十个章节 ---------------- */
  function renderStory(param) {
    var idx = param === null ? -1 : parseInt(param, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= STORY.length) renderStoryIndex();
    else renderChapter(idx);
  }

  function renderStoryIndex() {
    var body = $('#story-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'story-lead', FJ.STORY_INTRO.lead));
    body.appendChild(el('p', 'story-sub', FJ.STORY_INTRO.sub));

    var list = el('ol', 'story-list');
    STORY.forEach(function (ch, i) {
      var li = el('li', 'story-item');
      var a = el('a', 'story-card');
      a.href = '#/story/' + (i + 1);
      a.style.setProperty('--i', String(i));
      a.appendChild(el('span', 'story-no', ch.no));
      var main = el('span', 'story-main');
      main.appendChild(el('span', 'story-title', ch.title));
      main.appendChild(el('span', 'story-sub2', ch.sub));
      main.appendChild(el('span', 'story-excerpt', ch.lead));
      a.appendChild(main);
      var arrow = el('span', 'story-arrow', '→');
      arrow.setAttribute('aria-hidden', 'true');
      a.appendChild(arrow);
      li.appendChild(a);
      list.appendChild(li);
    });
    body.appendChild(list);

    var cta = el('div', 'story-cta');
    var b1 = el('button', 'btn btn--primary', '从第一章开始');
    b1.type = 'button';
    b1.addEventListener('click', function () { go('story', false, '1'); });
    var b2 = el('button', 'btn btn--ghost', '直接去做测试');
    b2.type = 'button';
    b2.addEventListener('click', function () { go('test'); });
    cta.appendChild(b1);
    cta.appendChild(b2);
    body.appendChild(cta);
  }

  function renderChapter(i) {
    var ch = STORY[i];
    var body = $('#story-body');
    body.innerHTML = '';
    doc.title = ch.title + ' · 我们能做多久的好朋友？';

    /* 进度点 */
    var rail = el('nav', 'chapter-rail');
    rail.setAttribute('aria-label', '章节导航');
    STORY.forEach(function (c, k) {
      var a = el('a', 'rail-dot' + (k === i ? ' is-on' : '') + (k < i ? ' is-done' : ''));
      a.href = '#/story/' + (k + 1);
      a.setAttribute('aria-label', '第 ' + (k + 1) + ' 章 ' + c.title);
      if (k === i) a.setAttribute('aria-current', 'page');
      a.appendChild(el('span', null, c.no));
      rail.appendChild(a);
    });
    body.appendChild(rail);
    /* 手机上十个进度点会横向滚动：把当前章节滚到可视区域中间 */
    if (rail.scrollWidth > rail.clientWidth + 4) {
      var onDot = rail.querySelector('.rail-dot.is-on');
      if (onDot) {
        try { onDot.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {}
      }
    }

    var head = el('header', 'chapter-head');
    head.appendChild(el('p', 'chapter-kicker', '第 ' + ch.no + ' 章 · ' + ch.sub));
    var h = el('h1', 'chapter-title', ch.title);
    h.setAttribute('tabindex', '-1');
    head.appendChild(h);
    head.appendChild(el('p', 'chapter-lead', fmt(ch.lead)));
    body.appendChild(head);

    var prose = el('div', 'chapter-prose');
    ch.paras.forEach(function (p) { prose.appendChild(el('p', null, fmt(p))); });
    body.appendChild(prose);

    if (ch.aside) body.appendChild(buildAside(ch.aside));

    /* 上一章 / 下一章 */
    var nav = el('div', 'chapter-nav');
    if (i > 0) {
      var prev = el('button', 'btn btn--ghost btn--sm', '← ' + STORY[i - 1].title);
      prev.type = 'button';
      prev.addEventListener('click', function () { go('story', false, String(i)); });
      nav.appendChild(prev);
    } else {
      var back = el('button', 'btn btn--ghost btn--sm', '← 章节列表');
      back.type = 'button';
      back.addEventListener('click', function () { go('story'); });
      nav.appendChild(back);
    }

    var spacer = el('span', 'chapter-nav-spacer');
    nav.appendChild(spacer);

    if (i < STORY.length - 1) {
      var next = el('button', 'btn btn--primary btn--sm', STORY[i + 1].title + ' →');
      next.type = 'button';
      next.addEventListener('click', function () { go('story', false, String(i + 2)); });
      nav.appendChild(next);
    } else {
      var toLetter = el('button', 'btn btn--primary btn--sm', '去读那封信 →');
      toLetter.type = 'button';
      toLetter.addEventListener('click', function () { go('letter'); });
      nav.appendChild(toLetter);
    }
    body.appendChild(nav);
  }

  function buildAside(a) {
    var box = el('aside', 'chapter-aside chapter-aside--' + a.type);

    if (a.type === 'facts') {
      box.appendChild(el('h2', 'aside-title', a.title));
      var dl = el('dl', 'aside-facts');
      a.items.forEach(function (it) {
        var d = el('div');
        d.appendChild(el('dt', null, it.k));
        d.appendChild(el('dd', null, it.v));
        dl.appendChild(d);
      });
      box.appendChild(dl);
    } else if (a.type === 'lines') {
      box.appendChild(el('h2', 'aside-title', a.title));
      var ul = el('ul', 'aside-lines');
      a.items.forEach(function (t) { ul.appendChild(el('li', null, fmt(t))); });
      box.appendChild(ul);
    } else if (a.type === 'note') {
      box.appendChild(el('h2', 'aside-title', a.title));
      var ul2 = el('ul', 'aside-note');
      a.items.forEach(function (t) { ul2.appendChild(el('li', null, fmt(t))); });
      box.appendChild(ul2);
    } else if (a.type === 'steps') {
      box.appendChild(el('h2', 'aside-title', a.title));
      var ol = el('ol', 'aside-steps');
      a.items.forEach(function (it, k) {
        var li = el('li');
        li.appendChild(el('span', 'step-no', pad2(k + 1)));
        var w = el('span', 'step-body');
        w.appendChild(el('b', null, it.t));
        w.appendChild(el('span', null, fmt(it.d)));
        li.appendChild(w);
        ol.appendChild(li);
      });
      box.appendChild(ol);
    } else if (a.type === 'memory') {
      box.appendChild(el('h2', 'aside-title', '留一个位置给一个瞬间'));
      box.appendChild(el('p', 'aside-note-text', '不用写得完整。一句话也可以。它只会保存在这台设备上，不会上传。'));
      var ta = doc.createElement('textarea');
      ta.id = 'memory-input';
      ta.className = 'memory-input';
      ta.rows = 3;
      ta.maxLength = 200;
      ta.placeholder = '比如：那天我们……';
      ta.value = state.memory || '';
      ta.setAttribute('aria-label', '写下你想记住的一个瞬间');
      box.appendChild(ta);
      var row = el('div', 'memory-row');
      var saveBtn = el('button', 'btn btn--ghost btn--sm', '保存在这台设备');
      saveBtn.type = 'button';
      var status = el('span', 'memory-status', state.memory ? '已保存' : '');
      saveBtn.addEventListener('click', function () {
        state.memory = ta.value.slice(0, 200);
        save();
        status.textContent = state.memory ? '已保存' : '已清空';
        toast(state.memory ? '这句话已经留在这台设备上了' : '已经清空');
      });
      row.appendChild(saveBtn);
      row.appendChild(status);
      box.appendChild(row);
    } else if (a.type === 'link') {
      box.classList.add('chapter-aside--link');
      var b = el('button', 'btn btn--primary', a.label);
      b.type = 'button';
      b.addEventListener('click', function () { go(a.to); });
      box.appendChild(b);
      if (a.hint) box.appendChild(el('p', 'aside-hint', a.hint));
      if (a.secondary) {
        var b2 = el('button', 'btn btn--text', a.secondary.label);
        b2.type = 'button';
        b2.addEventListener('click', function () { go(a.secondary.to); });
        box.appendChild(b2);
      }
    }
    return box;
  }

  /* ---------------- 测试 ---------------- */
  function renderTest() {
    var gate = $('#test-gate');
    var main = $('#test-main');
    if (!state.viewer) {
      gate.hidden = false;
      main.hidden = true;
      renderGate();
      return;
    }
    gate.hidden = true;
    main.hidden = false;
    renderQuestion(state.cursor);
  }

  function renderGate() {
    var box = $('#test-gate');
    box.innerHTML = '';
    var card = el('div', 'gate-card');
    card.appendChild(el('p', 'gate-kicker', '开始之前'));
    card.appendChild(el('h2', 'gate-title', '这份问卷是你在填'));
    card.appendChild(el('p', 'gate-text', '20 道题问的都是填写者自己的感受和观察。先确认一下你是谁——题目里提到对方时，会用正确的称呼；结果页也会写明这是谁的视角。'));

    var row = el('div', 'gate-actions');
    [['maker', FJ.PEOPLE.maker.name, '我来填，关于' + FJ.PEOPLE.receiver.name],
     ['receiver', FJ.PEOPLE.receiver.name, '我来填，关于' + FJ.PEOPLE.maker.name]].forEach(function (p) {
      var b = el('button', 'gate-btn');
      b.type = 'button';
      b.appendChild(el('b', null, p[1]));
      b.appendChild(el('span', null, p[2]));
      b.addEventListener('click', function () {
        state.viewer = p[0];
        save();
        renderTest();
        toast('好，接下来问到的是' + (p[0] === 'maker' ? FJ.PEOPLE.receiver.name : FJ.PEOPLE.maker.name));
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    var skip = el('button', 'link-btn gate-skip', '不想答也没关系，直接去读那封信 →');
    skip.type = 'button';
    skip.addEventListener('click', function () { go('letter'); });
    card.appendChild(skip);
    card.appendChild(el('p', 'gate-note', '选错也没关系，答题页可以随时切换视角。答案只保存在这台设备上。'));
    box.appendChild(card);
  }

  function renderQuestion(i) {
    var q = QS[i];
    if (!q) return;
    var dim = FJ.engine.dimById(q.dim);
    var chosen = state.answers[q.id];
    var v = viewerInfo();

    $('#q-index').textContent = pad2(i + 1);
    $('#q-dim').textContent = dim.name;
    $('#q-kicker').textContent = dim.intro;
    $('#q-view').textContent = fmt(FJ.PERSPECTIVE[q.view] || '');
    $('#q-title').textContent = fmt(q.q);

    var hint = $('#q-hint');
    hint.textContent = q.hint ? fmt(q.hint) : '';
    hint.hidden = !q.hint;

    $('#viewer-tag').textContent = '当前视角：' + v.me + '（关于' + v.cp + '）';

    var union = FJ.engine.optionList(q);
    var box = $('#q-options');
    box.innerHTML = '';
    var keys = ['A', 'B', 'C', 'D', 'E'];

    union.forEach(function (opt, idx) {
      var isUnknown = opt.level === null;
      var btn = el('button', 'opt' + (isUnknown ? ' opt--unknown' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', chosen === idx ? 'true' : 'false');
      btn.setAttribute('data-idx', String(idx));
      if (chosen === idx) btn.classList.add('is-on');

      var key = el('span', 'opt-key', isUnknown ? '—' : keys[idx]);
      key.setAttribute('aria-hidden', 'true');
      btn.appendChild(key);
      btn.appendChild(el('span', 'opt-label', fmt(opt.label)));
      var mark = el('span', 'opt-check');
      mark.setAttribute('aria-hidden', 'true');
      btn.appendChild(mark);

      btn.addEventListener('click', function () { selectOption(i, idx); });
      box.appendChild(btn);
    });

    var pct = Math.round((answeredCount() / N) * 100);
    $('#progress-fill').style.width = pct + '%';
    $('#progress-bar').setAttribute('aria-valuenow', String(pct));
    $('#progress-note').textContent = '已答 ' + answeredCount() + ' / ' + N;

    $('#prev-btn').textContent = i === 0 ? '回到首页' : '上一题';
    $('#next-btn').textContent = i === N - 1 ? (state.done ? '重新看结果' : '看看结果') : '下一题';

    updateNavNote();

    var card = $('#q-card');
    card.classList.remove('is-enter');
    void card.offsetWidth;
    card.classList.add('is-enter');
    try { $('#q-title').focus({ preventScroll: true }); } catch (e) {}
  }

  function updateNavNote() {
    var i = state.cursor;
    var q = QS[i];
    var note = $('#test-note');
    var has = typeof state.answers[q.id] === 'number';
    var left = N - answeredCount();
    if (!has) note.textContent = i === 0 ? '选一个最接近的就好，没有标准答案' : '这一题还没选，也可以选「说不好」';
    else if (left === 0) note.textContent = '都答完了，可以看结果了';
    else note.textContent = '还有 ' + left + ' 题没答';
    $('#next-btn').classList.toggle('is-ready', has);
  }

  function selectOption(qIndex, optIndex) {
    var q = QS[qIndex];
    var had = typeof state.answers[q.id] === 'number';
    clearTimeout(advanceTimer);
    advanceTimer = null;

    state.answers[q.id] = optIndex;
    save();

    var box = $('#q-options');
    $$('.opt', box).forEach(function (b) {
      var on = b.getAttribute('data-idx') === String(optIndex);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    var pct = Math.round((answeredCount() / N) * 100);
    $('#progress-fill').style.width = pct + '%';
    $('#progress-bar').setAttribute('aria-valuenow', String(pct));
    $('#progress-note').textContent = '已答 ' + answeredCount() + ' / ' + N;
    updateNavNote();

    if (!had && qIndex < N - 1) {
      advanceTimer = setTimeout(function () {
        advanceTimer = null;
        if (route === 'test') gotoQuestion(qIndex + 1);
      }, 420);
    }
  }

  function gotoQuestion(i) {
    if (i < 0 || i >= N) return;
    clearTimeout(advanceTimer);
    advanceTimer = null;
    state.cursor = i;
    save();
    renderQuestion(i);
    root.scrollTo(0, 0);
  }

  function onNext() {
    var i = state.cursor;
    var q = QS[i];
    if (typeof state.answers[q.id] !== 'number') {
      var card = $('#q-card');
      card.classList.remove('is-shake');
      void card.offsetWidth;
      card.classList.add('is-shake');
      toast('先选一个。实在不确定，就选最后那个「说不好」');
      return;
    }
    if (i < N - 1) { gotoQuestion(i + 1); return; }
    if (!allAnswered()) {
      var miss = firstUnanswered();
      gotoQuestion(miss);
      toast('第 ' + (miss + 1) + ' 题还没有回答');
      return;
    }
    state.done = true;
    save();
    go('result');
  }

  function bindTest() {
    $('#next-btn').addEventListener('click', onNext);
    $('#prev-btn').addEventListener('click', function () {
      if (state.cursor === 0) { go('home'); return; }
      gotoQuestion(state.cursor - 1);
    });
    $('#switch-viewer').addEventListener('click', function () {
      state.viewer = null;
      save();
      renderTest();
    });

    doc.addEventListener('keydown', function (e) {
      if (route !== 'test' || !state.viewer) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') { if (state.cursor > 0) gotoQuestion(state.cursor - 1); }
      else if (e.key === 'ArrowRight') { onNext(); }
      else if (/^[1-5]$/.test(e.key)) {
        var idx = parseInt(e.key, 10) - 1;
        var btn = $('.opt[data-idx="' + idx + '"]');
        if (btn) btn.click();
      }
    });
  }

  /* ---------------- 结果 ---------------- */
  function renderResult() {
    var r = currentResult();
    var v = viewerInfo();

    var C = 2 * Math.PI * 86;
    var ring = $('#ring-value');
    ring.style.strokeDasharray = C.toFixed(2);
    ring.style.strokeDashoffset = C.toFixed(2);

    if (r.score === null) {
      $('#score-value').textContent = '—';
      $('#ring-word').textContent = '—';
      $('#score-label').textContent = '有效答案不足，暂不计算总体指数';
    } else {
      animateNumber($('#score-value'), r.score, reduceMotion() ? 0 : 820);
      $('#ring-word').textContent = r.band.word;
      $('#score-label').textContent = r.band.label;
      var offset = C * (1 - r.score / 100);
      if (reduceMotion()) ring.style.strokeDashoffset = offset.toFixed(2);
      else requestAnimationFrame(function () { ring.style.strokeDashoffset = offset.toFixed(2); });
    }

    $('#coverage-value').textContent = r.coverage + '%';
    $('#coverage-fill').style.width = r.coverage + '%';
    $('#result-who').textContent = state.viewer ? '这份结果来自' + v.me + '的填写' : '这份结果来自填写者的视角';

    var covNote = '有效回答 ' + r.validItems + ' / ' + r.totalItems + ' 题';
    if (r.unknownItems > 0) covNote += '，其中 ' + r.unknownItems + ' 题选了「说不好」';
    if (!r.canScore) covNote += '。样本不足，所以不给总分。';
    $('#coverage-note').textContent = covNote;

    var warn = $('#coverage-warning');
    if (!r.canScore) {
      warn.hidden = false;
      warn.classList.remove('warn-card--soft');
      warn.innerHTML =
        '<p class="warn-title">先说清楚：这份结果的信息还不足</p>' +
        '<p>有效回答只有 ' + r.validItems + ' 题，覆盖度 ' + r.coverage + '%。要给出总体指数，至少需要 6 个方面、12 道题的有效答案。现在没有达到，所以上面显示的是「—」，而不是一个看起来很像结论的数字。</p>' +
        '<p>可以点下面的「修改答案」，把能确定的补上。</p>';
    } else if (r.coverage < 70) {
      warn.hidden = false;
      warn.classList.add('warn-card--soft');
      warn.innerHTML =
        '<p class="warn-title">数据还不够完整</p>' +
        '<p>有 ' + (r.totalDims - r.validDims) + ' 个方面没有计入指数。总分是在剩余的 ' + r.validDims + ' 个方面上算出来的，可以当作参考，但不适合当成结论。</p>';
    } else {
      warn.hidden = true;
    }

    renderDims(r);
    renderRadar(r);
    renderReport(r);
    renderScenMini(r);
    renderYearChips();
  }

  function animateNumber(node, target, dur) {
    if (dur === 0) { node.textContent = String(target); return; }
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderDims(r) {
    var list = $('#dim-list');
    list.innerHTML = '';

    r.dims.forEach(function (d) {
      var item = el('details', 'dim-item');
      item.setAttribute('data-level', d.level);

      var sum = el('summary', 'dim-summary');
      sum.appendChild(el('span', 'dim-no', d.no));
      var nameWrap = el('span', 'dim-name-wrap');
      nameWrap.appendChild(el('span', 'dim-name', d.name));
      nameWrap.appendChild(el('span', 'dim-valid', d.percent === null ? '未计入' : '依据 ' + d.valid + ' 题'));
      sum.appendChild(nameWrap);

      var bar = el('span', 'dim-bar');
      var fill = el('i');
      fill.style.width = (d.percent === null ? 0 : d.percent) + '%';
      bar.appendChild(fill);
      if (d.percent === null) bar.classList.add('is-empty');
      sum.appendChild(bar);
      sum.appendChild(el('span', 'dim-score', d.percent === null ? '—' : String(d.percent)));
      item.appendChild(sum);

      var body = el('div', 'dim-body');
      if (d.percent === null) {
        body.appendChild(el('p', 'dim-text', '这个方面没有计入指数：你可能选了「说不好」，或者还没有答。它不会被当成 0 分，也不会被当成满分。'));
      } else {
        body.appendChild(el('p', 'dim-text', fmt(d.text[d.level])));
        body.appendChild(el('p', 'dim-weighted', '这一项占总体指数的 ' + d.weight + '%，维度分 ' + d.percent + ' 分。'));
      }

      var basis = el('ul', 'dim-basis');
      d.items.forEach(function (it) {
        var li = el('li');
        li.appendChild(el('span', 'basis-q', '第 ' + Number(it.id.slice(1)) + ' 题 · ' + fmt(it.q)));
        var ans = el('span', 'basis-a');
        if (!it.answered) ans.textContent = '未回答（不计入）';
        else if (it.skipped) ans.textContent = '你的选择：' + fmt(it.chosen) + '（不计入）';
        else ans.textContent = '你的选择：' + fmt(it.chosen) + '（' + Math.round(it.level / 4 * 100) + ' 分）';
        li.appendChild(ans);
        basis.appendChild(li);
      });
      body.appendChild(basis);
      body.appendChild(el('p', 'dim-tip', '可以试试：' + fmt(d.tip)));
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  function renderRadar(r) {
    var svg = $('#radar');
    var cx = 170, cy = 170, R = 118;
    var dims = r.dims;
    var n = dims.length;
    function angle(i) { return (-Math.PI / 2) + (2 * Math.PI * i) / n; }
    function pt(i, ratio) {
      var a = angle(i);
      return [cx + Math.cos(a) * R * ratio, cy + Math.sin(a) * R * ratio];
    }

    var parts = [];
    [0.25, 0.5, 0.75, 1].forEach(function (ratio) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, ratio); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); }
      parts.push('<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(42,37,35,.10)" stroke-width="1"/>');
    });
    for (var i = 0; i < n; i++) {
      var p = pt(i, 1);
      var valid = dims[i].percent !== null;
      parts.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) +
        '" stroke="rgba(42,37,35,' + (valid ? '.10' : '.05') + ')" stroke-width="1"' + (valid ? '' : ' stroke-dasharray="2 4"') + '/>');
    }

    var seq = [];
    for (var j = 0; j < n; j++) if (dims[j].percent !== null) seq.push([j, dims[j].percent / 100]);
    if (seq.length >= 3) {
      var poly = seq.map(function (s) {
        var p2 = pt(s[0], Math.max(0.02, s[1]));
        return p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
      });
      parts.push('<polygon points="' + poly.join(' ') + '" fill="rgba(185,106,118,.16)" stroke="#B96A76" stroke-width="1.8" stroke-linejoin="round"/>');
    }
    seq.forEach(function (s) {
      var p3 = pt(s[0], Math.max(0.02, s[1]));
      parts.push('<circle cx="' + p3[0].toFixed(1) + '" cy="' + p3[1].toFixed(1) + '" r="3" fill="#FBF7F1" stroke="#B96A76" stroke-width="1.6"/>');
    });

    for (var k = 0; k < n; k++) {
      var a = angle(k);
      var lx = cx + Math.cos(a) * (R + 24);
      var ly = cy + Math.sin(a) * (R + 24) + 4;
      var anchor = 'middle';
      if (Math.cos(a) > 0.35) anchor = 'start';
      else if (Math.cos(a) < -0.35) anchor = 'end';
      var off = dims[k].percent === null;
      parts.push('<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor +
        '" font-size="11.5" fill="' + (off ? 'rgba(110,102,94,.55)' : 'rgba(60,52,48,.92)') + '">' +
        dims[k].short + (off ? ' —' : '') + '</text>');
    }
    svg.innerHTML = parts.join('');

    var offs = dims.filter(function (d) { return d.percent === null; });
    $('#radar-note').textContent = !offs.length
      ? '十个方面都纳入了计算。'
      : '灰色虚线的 ' + offs.length + ' 个方面没有计入：' + offs.map(function (d) { return d.name; }).join('、') + '。';
  }

  function renderReport(r) {
    var rep = FJ.engine.buildReport(r);
    var v = viewerInfo();
    var body = $('#report-body');
    var html = '';

    html += '<p class="report-lead">' + esc(fmt(rep.lead)) + '</p>';
    html += '<div class="report-note"><b>关于视角</b>这份结果来自 ' + esc(v.me) + ' 一个人的填写。它描述的是' +
      (state.viewer ? '你' : '填写者') + '此刻看到的关系，不是' + esc(v.cp) + '的真实想法，也不是你们共同确认过的结论。</div>';

    var blocks = [
      { n: '01', t: '现在的答案能说明什么', p: rep.canSay },
      { n: '02', t: '还不确定的方面', p: rep.unsure },
      { n: '03', t: '目前值得珍惜的地方', p: rep.cherish },
      { n: '04', t: '可以继续经营的地方', p: rep.work },
      { n: '05', t: '距离可能带来的影响', p: rep.distance, wide: true }
    ];

    html += '<div class="report-items">';
    blocks.forEach(function (b) {
      html += '<article class="report-item' + (b.wide ? ' report-item--wide' : '') + '"><h3><span>' + b.n + '</span>' + b.t + '</h3>';
      b.p.forEach(function (p) { html += '<p>' + esc(fmt(p)) + '</p>'; });
      html += '</article>';
    });
    html += '</div>';

    html += '<div class="report-block"><h3 class="report-h3">三种未来，三个方向</h3>';
    html += '<p class="report-scen-line">' + rep.scenarios.map(function (s) { return s.name; }).join(' · ') + '。三段都是基于假设的场景描述，不是预测，也不含概率。</p>';
    html += '<p class="report-link">完整的时间轴在<button class="btn btn--text" type="button" data-go="futures">未来这一页 →</button></p>';
    html += '</div>';

    html += '<div class="report-closing"><p>' + esc(fmt(rep.closing)) + '</p></div>';
    body.innerHTML = html;
  }

  function renderScenMini() {
    var box = $('#scen-mini');
    box.innerHTML = '';
    FJ.SCENARIOS.forEach(function (s) {
      var card = el('article', 'scen-mini-item');
      card.style.setProperty('--scen', s.color);
      var head = el('div', 'scen-mini-head');
      head.appendChild(el('span', 'scen-dot'));
      head.appendChild(el('b', null, s.name));
      head.appendChild(el('em', null, s.tag));
      card.appendChild(head);
      card.appendChild(el('p', null, fmt(s.summary)));
      var btn = el('button', 'btn btn--text', '看这条时间轴 →');
      btn.type = 'button';
      btn.addEventListener('click', function () { scenActive = s.id; go('futures'); });
      card.appendChild(btn);
      box.appendChild(card);
    });
  }

  function renderYearChips() {
    var box = $('#year-chips');
    box.innerHTML = '';
    FJ.SCENARIOS[0].nodes.forEach(function (n) {
      var chip = el('span', 'year-chip');
      chip.appendChild(el('b', null, String(n.year)));
      chip.appendChild(el('span', null, '年后'));
      box.appendChild(chip);
    });
  }

  /* ---------------- 未来 ---------------- */
  function renderFutures() {
    var r = currentResult();
    var tabs = $('#scen-tabs');
    tabs.innerHTML = '';

    FJ.SCENARIOS.forEach(function (s) {
      var b = el('button', 'scen-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', scenActive === s.id ? 'true' : 'false');
      b.style.setProperty('--scen', s.color);
      if (scenActive === s.id) b.classList.add('is-on');
      b.appendChild(el('span', 'scen-dot'));
      var t = el('span', 'scen-tab-text');
      t.appendChild(el('b', null, s.name));
      t.appendChild(el('em', null, s.tag));
      b.appendChild(t);
      b.addEventListener('click', function () { scenActive = s.id; renderFutures(); });
      tabs.appendChild(b);
    });

    var s = FJ.SCENARIOS.filter(function (x) { return x.id === scenActive; })[0] || FJ.SCENARIOS[0];
    var panel = $('#scen-panel');
    panel.style.setProperty('--scen', s.color);
    $('#scen-dot').style.background = s.color;
    $('#scen-name').textContent = s.name;
    $('#scen-tag').textContent = s.tag;
    $('#scen-summary').textContent = fmt(s.summary);

    var tl = $('#timeline');
    tl.innerHTML = '';
    s.nodes.forEach(function (n, i) {
      var li = el('li', 'tl-item');
      li.style.setProperty('--i', String(i));
      var yearBox = el('div', 'tl-year');
      yearBox.appendChild(el('b', null, String(n.year)));
      yearBox.appendChild(el('span', null, '年后'));
      li.appendChild(yearBox);
      var body = el('div', 'tl-body');
      body.appendChild(el('p', null, fmt(n.text)));
      li.appendChild(body);
      tl.appendChild(li);
    });

    var ul = $('#scen-assumptions');
    ul.innerHTML = '';
    s.assumptions.forEach(function (a) { ul.appendChild(el('li', null, fmt(a))); });

    var basis = FJ.engine.basis(r);
    var you = $('#basis-you');
    if (!basis.length) {
      you.textContent = '你还没有可以对照的答案（这三个方面都选了「说不好」或没有作答）。所以下面的情景只是通用描述。';
    } else {
      you.textContent = '你在' + basis.join('、') + '。这三个方面不在情景文字里被"计算"，只作为你读这三段时的参照。';
    }
  }

  /* ---------------- 寄语 ---------------- */
  function buildLetter() {
    if (letterBuilt) return;
    var body = $('#letter-body');
    body.innerHTML = '';
    FJ.LETTER.forEach(function (p, i) {
      var node = el('p', 'letter-p', p);
      node.style.setProperty('--i', String(i));
      body.appendChild(node);
    });
    var body2 = $('#letter-body-2');
    body2.innerHTML = '';
    FJ.LETTER_2.forEach(function (p) {
      body2.appendChild(el('p', 'letter-p-second', p));
    });
    letterBuilt = true;
  }

  function showLetter(which) {
    activeLetter = which === 2 ? 2 : 1;
    var second = activeLetter === 2;
    $('#letter-paper').hidden = second;
    $('#letter-paper-2').hidden = !second;
    $$('.letter-tab').forEach(function (tab) {
      var on = Number(tab.getAttribute('data-letter')) === activeLetter;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    $('#next-letter').textContent = second ? '回到第一封信' : '继续读第二封信';
    $('#copy-letter').textContent = second ? '复制第二封信' : '复制第一封信';
  }

  function renderLetter(reset) {
    buildLetter();
    if (reset && !letterOpened) {
      showLetter(1);
      $('#letter-tabs').hidden = true;
      $('#letter-paper').hidden = true;
      $('#letter-paper-2').hidden = true;
      $('#letter-actions').hidden = true;
      $('#envelope-stage').hidden = false;
      $('#envelope-stage').classList.remove('is-open');
    }
  }

  function openLetter(silent) {
    if (letterOpened) return;
    letterOpened = true;
    var stage = $('#envelope-stage');
    var actions = $('#letter-actions');
    var paras = $$('.letter-p');

    stage.classList.add('is-open');
    function reveal() {
      stage.hidden = true;
      $('#letter-tabs').hidden = false;
      showLetter(activeLetter);
      actions.hidden = false;
      if (silent || reduceMotion()) paras.forEach(function (p) { p.classList.add('is-in'); });
      else paras.forEach(function (p, i) { setTimeout(function () { p.classList.add('is-in'); }, 120 + i * 260); });
    }
    if (silent || reduceMotion()) reveal();
    else setTimeout(reveal, 780);
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && root.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(legacyCopy(text)); });
        return;
      }
      resolve(legacyCopy(text));
    });
  }
  function legacyCopy(text) {
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }
  function bindLetter() {
    buildLetter();
    $('#envelope').addEventListener('click', function () { openLetter(false); });
    $$('.letter-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showLetter(Number(tab.getAttribute('data-letter'))); });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var next = activeLetter === 1 ? 2 : 1;
        showLetter(next);
        $('#letter-tab-' + next).focus();
      });
    });
    $('#next-letter').addEventListener('click', function () {
      showLetter(activeLetter === 1 ? 2 : 1);
      $('#letter-tabs').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    });
    $('#copy-letter').addEventListener('click', function () {
      var text = activeLetter === 2 ? FJ.LETTER_2.join('\n\n') : FJ.LETTER.join('\n\n');
      copyText(text).then(function (ok) {
        toast(ok ? '这封信已经复制好了' : '这个浏览器不允许自动复制，长按选中文字也可以');
      });
    });
  }

  /* ---------------- 纪念卡 ---------------- */
  function renderCard() {
    var input = $('#card-date');
    if (!cardDate) cardDate = FJ.card.todayISO();
    input.value = cardDate;

    /* currentResult() 在没答完时返回 canScore=false，卡片会自动切到"无指数"版式 */
    FJ.card.render($('#card-canvas'), FJ.card.buildData(currentResult(), cardDate));
    $('#card-fallback').hidden = true;
  }

  function showFallback() {
    var canvas = $('#card-canvas');
    var img = $('#card-image');
    try { img.src = canvas.toDataURL('image/png'); } catch (e) { return; }
    $('#card-fallback').hidden = false;
  }

  function isIOSLike() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  function bindCard() {
    $('#card-date').addEventListener('change', function () {
      var v = this.value;
      cardDate = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : FJ.card.todayISO();
      this.value = cardDate;
      FJ.card.render($('#card-canvas'), FJ.card.buildData(currentResult(), cardDate));
      $('#card-fallback').hidden = true;
    });

    $('#download-png').addEventListener('click', function () {
      var canvas = $('#card-canvas');
      FJ.card.download(canvas, FJ.card.fileName(cardDate)).then(function () {
        if (isIOSLike()) {
          toast('图片已生成。如果没看到下载，长按下面的图片保存');
          showFallback();
        } else {
          toast('图片已生成，正在下载');
        }
      }, function () {
        toast('这个浏览器不支持直接下载，用下面的方式保存');
        showFallback();
      });
    });

    $('#save-fallback').addEventListener('click', function () {
      showFallback();
      var box = $('#card-fallback');
      if (!box.hidden) {
        box.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
        toast('长按图片（手机）或右键另存为（电脑）');
      }
    });
  }

  /* ---------------- 开场 ---------------- */
  function bindIntro() {
    var intro = $('#intro');
    if (!intro) return;
    var seen = false;
    try { seen = sessionStorage.getItem(SESSION_INTRO) === '1'; } catch (e) {}
    if (seen || reduceMotion()) { intro.hidden = true; return; }

    intro.hidden = false;
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      intro.classList.add('is-gone');
      try { sessionStorage.setItem(SESSION_INTRO, '1'); } catch (e) {}
      setTimeout(function () { intro.hidden = true; }, 620);
    }
    $('#intro-skip').addEventListener('click', close);
    intro.addEventListener('click', function (e) {
      if (e.target.id === 'intro-skip') return;
      close();
    });
    setTimeout(close, 3200);
  }

  /* ---------------- 全局绑定 ---------------- */
  function bindGlobal() {
    doc.addEventListener('click', function (e) {
      var goBtn = e.target.closest('[data-go]');
      if (goBtn) {
        e.preventDefault();
        var target = goBtn.getAttribute('data-go');
        var seg = target.split('/');
        go(seg[0], false, seg[1]);
        return;
      }

      var step = e.target.closest('.steps a');
      if (step) {
        var s = step.getAttribute('data-step');
        if ((s === 'result' || s === 'futures') && !allAnswered()) {
          e.preventDefault();
          toast('先答完这 20 个问题，这一页才有内容');
        }
      }
    });

    $('#edit-answers').addEventListener('click', function () {
      state.done = false;
      state.cursor = 0;
      save();
      go('test');
      setTimeout(function () { toast('答案都还在，改完直接看结果'); }, 420);
    });

    $('#restart-test').addEventListener('click', function () {
      if (!root.confirm('重新测试会清空现在的答案，从头开始。确定吗？')) return;
      clearSaved();
      letterOpened = false;
      go('test');
      setTimeout(function () { toast('已经清空，重新开始'); }, 320);
    });

    $('#clear-data').addEventListener('click', function () {
      if (!root.confirm('会清除这台设备上保存的答案和那句回忆，之后需要重新填写。确定吗？')) return;
      clearSaved();
      letterOpened = false;
      go('home');
      setTimeout(function () { toast('本机保存的数据已清除'); }, 320);
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    load();
    renderHomeChapters();

    var t = $('#toast');
    if (t && t.parentNode !== doc.body) doc.body.appendChild(t);

    bindTest();
    bindLetter();
    bindCard();
    bindGlobal();
    bindIntro();

    var r = parseRoute();
    if (!location.hash) {
      try { history.replaceState(null, '', '#/home'); } catch (e) { location.hash = '#/home'; }
    }
    render(r.view, r.param);

    root.addEventListener('hashchange', function () {
      var nr = parseRoute();
      render(nr.view, nr.param);
    });

    buildLetter();
    root.__FJ_READY__ = true;
  }

  /* 脚本位于 body 末尾，此时 DOM 已完整。立即启动而不是等 DOMContentLoaded，
     可以让首页的十个章节入口在首次绘制前就位，避免布局偏移（CLS）。 */
  if (doc.getElementById('view-home')) boot();
  else doc.addEventListener('DOMContentLoaded', boot);

})(window, document);
