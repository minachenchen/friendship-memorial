/* ============================================================
   《我们能做多久的好朋友？》— 纪念卡
   1080 × 1350 真实 Canvas 绘制，导出 PNG。
   不依赖任何第三方库、外部图片或网络字体。
   ============================================================ */
(function (root) {
  'use strict';

  var FJ = root.FJ = root.FJ || {};

  var W = 1080, H = 1350;
  var SERIF = '"Songti SC","Noto Serif SC","Source Han Serif SC","STSong","SimSun",Georgia,serif';
  var SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,sans-serif';
  var MONO = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayString() {
    var d = new Date();
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  /* input[type=date] 只接受 YYYY-MM-DD */
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* 单行文字自适应：超宽时逐级缩小字号，避免任何情况下溢出画布 */
  function fitSize(ctx, text, maxWidth, size, family, min) {
    var s = size;
    while (s > (min || 11)) {
      ctx.font = s + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      s -= 1;
    }
    return s;
  }

  /* 把 input[type=date] 的 YYYY-MM-DD 转成卡片上的 YYYY.MM.DD；非法输入回落到今天 */
  function normalizeDate(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value.replace(/-/g, '.');
    }
    return todayString();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 带字距的居中文字 */
  function spacedText(ctx, text, cx, y, spacing) {
    var chars = Array.from(text);
    var widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var x = cx - total / 2;
    ctx.textAlign = 'left';
    for (var i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x, y);
      x += widths[i] + spacing;
    }
  }

  /* 中文按字换行，避免长句溢出 */
  function wrap(ctx, text, maxWidth) {
    var chars = Array.from(text);
    var lines = [], cur = '';
    for (var i = 0; i < chars.length; i++) {
      var test = cur + chars[i];
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = chars[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function star(ctx, cx, cy, r, fill) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  var DOTS = [
    [150, 236, 1.8], [214, 186, 1.1], [890, 206, 1.6], [962, 296, 1.1],
    [120, 616, 1.2], [980, 696, 1.7], [86, 1016, 1.3], [1000, 1006, 1.1],
    [200, 1286, 1.4], [880, 1316, 1.2], [420, 146, 1.1], [700, 1290, 1.5],
    [330, 756, 1.0], [760, 896, 1.1], [250, 1146, 1.0], [820, 556, 1.2]
  ];

  function render(canvas, data) {
    var ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    /* 背景 */
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#FDF9F3');
    bg.addColorStop(0.46, '#FBF2F3');
    bg.addColorStop(1, '#F0F4F9');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 柔光 */
    function glow(x, y, r, color) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    glow(140, 200, 540, 'rgba(223,166,176,.28)');
    glow(960, 1160, 580, 'rgba(170,158,210,.20)');
    glow(880, 250, 400, 'rgba(158,190,214,.16)');

    /* 星点 */
    DOTS.forEach(function (d) {
      ctx.beginPath();
      ctx.arc(d[0], d[1], d[2], 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(42,37,35,.15)';
      ctx.fill();
    });

    /* 双线边框 */
    ctx.strokeStyle = 'rgba(176,126,120,.26)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, 48, 48, W - 96, H - 96, 28);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(176,126,120,.13)';
    ctx.lineWidth = 1;
    roundRect(ctx, 62, 62, W - 124, H - 124, 20);
    ctx.stroke();

    /* 顶部 */
    star(ctx, W / 2, 110, 12, 'rgba(185,106,118,.85)');

    ctx.fillStyle = 'rgba(110,102,94,.80)';
    ctx.font = '16px ' + MONO;
    ctx.textBaseline = 'middle';
    spacedText(ctx, 'A CALCULATION ABOUT FRIENDSHIP', W / 2, 152, 5);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2A2523';
    ctx.font = '62px ' + SERIF;
    ctx.fillText('我们能做多久的好朋友？', W / 2, 252);

    ctx.fillStyle = 'rgba(87,79,73,.86)';
    ctx.font = '26px ' + SANS;
    ctx.fillText('一场关于友情、相遇、距离与未来的计算', W / 2, 300);

    /* 收礼人 / 制作人 */
    ctx.fillStyle = 'rgba(158,86,97,.92)';
    ctx.font = '22px ' + SERIF;
    spacedText(ctx, FJ.CARD_META.to + '   ·   ' + FJ.CARD_META.from, W / 2, 346, 2);

    ctx.strokeStyle = 'rgba(176,126,120,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 64, 382);
    ctx.lineTo(W / 2 + 64, 382);
    ctx.stroke();

    /* 卡片不印分数：它是一份纪念，不是一张成绩单。
       姓名、一句话、日期与印章，就够了。 */
    var Y = { quoteRule: 540, quoteTop: 620, hairline: 806, facts: 872 };

    /* 短句 */
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(176,126,120,.24)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 42, Y.quoteRule);
    ctx.lineTo(W / 2 + 42, Y.quoteRule);
    ctx.stroke();

    ctx.font = '36px ' + SERIF;
    ctx.fillStyle = 'rgba(42,37,35,.94)';
    var mainLines = wrap(ctx, FJ.CARD_META.line, 780).slice(0, 2);
    var ly = Y.quoteTop;
    mainLines.forEach(function (l) {
      ctx.fillText(l, W / 2, ly);
      ly += 52;
    });

    /* 短句下方的细线，把"内容"和"落款"分开 */
    ctx.strokeStyle = 'rgba(176,126,120,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 17, Y.hairline);
    ctx.lineTo(W / 2 + 17, Y.hairline);
    ctx.stroke();

    /* 三项事实 */
    var factText = FJ.HOME_FACTS.map(function (f) { return f.k + f.v; }).join('   ·   ');
    var factSize = fitSize(ctx, factText, 820, 23, SANS, 14);
    ctx.font = factSize + 'px ' + SANS;
    ctx.fillStyle = 'rgba(110,102,94,.88)';
    ctx.fillText(factText, W / 2, Y.facts);

    /* 印章 */
    ctx.save();
    ctx.translate(W / 2, 1066);
    ctx.rotate(-0.055);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#B96A76';
    roundRect(ctx, -46, -46, 92, 92, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.lineWidth = 2;
    roundRect(ctx, -37, -37, 74, 74, 9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,252,248,.98)';
    ctx.font = '44px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('惜', 0, 2);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    /* 落款 */
    ctx.textAlign = 'center';
    ctx.font = '23px ' + SANS;
    ctx.fillStyle = 'rgba(87,79,73,.90)';
    ctx.fillText('写给我们认识的第三个月', W / 2, 1178);

    ctx.font = '21px ' + MONO;
    ctx.fillStyle = 'rgba(126,118,110,.95)';
    ctx.fillText(data.date, W / 2, 1222);

    ctx.font = '17px ' + SANS;
    ctx.fillStyle = 'rgba(126,118,110,.80)';
    ctx.fillText('答案只保存在填写者的设备里 · 不是心理测验', W / 2, 1264);

    return canvas;
  }

  function buildData(result, dateValue) {
    /* result 仍然接受，但卡片不再依赖分数；保留签名以免调用方改动 */
    return { date: normalizeDate(dateValue) };
  }

  function fileName(dateValue) {
    return '友情纪念卡-' + normalizeDate(dateValue).replace(/\./g, '') + '.png';
  }

  function download(canvas, name) {
    return new Promise(function (resolve, reject) {
      var a;
      try {
        /* 同步生成 data URL，保证下载由用户手势直接触发：
           toBlob 的回调发生在手势之外，Safari 与部分 Chromium 会取消下载。 */
        var url = canvas.toDataURL('image/png');
        if (!url || url.length < 100) { reject(new Error('图片生成失败')); return; }
        a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1200);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    });
  }

  FJ.card = {
    render: render,
    buildData: buildData,
    download: download,
    fileName: fileName,
    normalizeDate: normalizeDate,
    todayString: todayString,
    todayISO: todayISO,
    size: { w: W, h: H }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
