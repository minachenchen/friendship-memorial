/* ============================================================
   《我们能做多久的好朋友？》— 计算层
   纯函数、确定性、无随机数、无网络。
   ------------------------------------------------------------
   计分口径（与结果页展示的说明完全一致）：
   1. 每个选项有 0–4 的刻度 level；"说不好" level = null，不参与计算。
   2. 维度分 = 该维度有效题目的 level 平均值 ÷ 4 × 100，四舍五入到整数。
   3. 总体指数 = 所有"有有效答案"的维度的维度分平均值（十维等权）。
      口径必须与页面上的说明一致：先算每个维度的分（不取整），再对维度等权平均，
      最后 ÷ 4 × 100 并四舍五入。不能把所有题目的刻度直接平均——那样某一维度
      只答一题时，它在总分里的权重会被悄悄放大。
   4. 覆盖度 = 有效题目数 ÷ 20 × 100。
   5. 有效维度 < 6 或有效题目 < 12 时，不输出总体指数（避免用太少样本下结论）。
   ============================================================ */
(function (root) {
  'use strict';

  var FJ = root.FJ = root.FJ || {};

  var TOTAL_ITEMS = FJ.QUESTIONS.length;
  var MIN_DIMS_FOR_SCORE = 6;
  var MIN_ITEMS_FOR_SCORE = 12;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round(v) { return Math.round(v); }

  /* 某题的可选项（含统一的"说不好"） */
  function optionList(q) {
    return q.options.concat([FJ.UNKNOWN_OPTION]);
  }

  /* 取某题被选中的选项对象 */
  function chosenOption(q, idx) {
    if (idx === undefined || idx === null) return null;
    var list = optionList(q);
    return list[idx] || null;
  }

  /* 某题的有效 level（0–4），未答或"说不好"返回 null */
  function itemLevel(q, idx) {
    var opt = chosenOption(q, idx);
    if (!opt) return null;
    if (opt.level === null || opt.level === undefined) return null;
    return opt.level;
  }

  function dimById(id) {
    for (var i = 0; i < FJ.DIMS.length; i++) {
      if (FJ.DIMS[i].id === id) return FJ.DIMS[i];
    }
    return null;
  }

  function levelOf(percent) {
    if (percent === null) return 'unknown';
    if (percent >= 70) return 'high';
    if (percent >= 45) return 'mid';
    return 'low';
  }

  /* ---------------- 核心计算 ---------------- */
  function compute(answers) {
    answers = answers || {};

    var totalItems = 0, validItems = 0, answeredItems = 0;
    var dimMeanSum = 0, dimMeanCount = 0;
    var validDims = 0;

    var dims = FJ.DIMS.map(function (d) {
      var qs = FJ.QUESTIONS.filter(function (q) { return q.dim === d.id; });
      var valid = 0, sum = 0, items = [];

      qs.forEach(function (q) {
        var idx = answers[q.id];
        var answered = idx !== undefined && idx !== null;
        var lv = itemLevel(q, idx);
        totalItems += 1;
        if (answered) answeredItems += 1;
        if (lv !== null) { valid += 1; sum += lv; validItems += 1; }
        var opt = chosenOption(q, idx);
        items.push({
          id: q.id,
          q: q.q,
          dim: d.id,
          answered: answered,
          chosen: opt ? opt.label : null,
          level: lv,
          skipped: answered && lv === null
        });
      });

      var percent = valid > 0 ? round((sum / valid) / 4 * 100) : null;
      if (percent !== null) {
        validDims += 1;
        dimMeanSum += sum / valid;   // 维度原始均值（0–4，不取整）
        dimMeanCount += 1;
      }

      return {
        id: d.id, name: d.name, short: d.short, no: d.no,
        weight: d.weight, intro: d.intro, tip: d.tip, text: d.text,
        items: items,
        valid: valid,
        total: qs.length,
        percent: percent,
        level: levelOf(percent)
      };
    });

    var coverage = totalItems > 0 ? round(validItems / totalItems * 100) : 0;
    var canScore = validDims >= MIN_DIMS_FOR_SCORE && validItems >= MIN_ITEMS_FOR_SCORE;
    var score = canScore && dimMeanCount > 0
      ? round((dimMeanSum / dimMeanCount) / 4 * 100)
      : null;

    var band = null;
    if (score !== null) {
      for (var i = 0; i < FJ.BANDS.length; i++) {
        if (score >= FJ.BANDS[i].min) { band = FJ.BANDS[i]; break; }
      }
    }

    return {
      dims: dims,
      score: score,
      band: band,
      coverage: coverage,
      totalItems: totalItems,
      validItems: validItems,
      answeredItems: answeredItems,
      validDims: validDims,
      totalDims: FJ.DIMS.length,
      canScore: canScore,
      complete: answeredItems === totalItems,
      unknownItems: answeredItems - validItems
    };
  }

  /* ---------------- 报告 ---------------- */
  function sortedDims(dims, filter) {
    return dims.filter(filter).slice().sort(function (a, b) {
      if (b.percent !== a.percent) return b.percent - a.percent;
      return a.no.localeCompare(b.no);
    });
  }

  function joinNames(list, sep) {
    return list.map(function (d) { return '「' + d.name + '」'; }).join(sep);
  }

  function lead(result) {
    if (!result.canScore) {
      if (result.validItems === 0) {
        return '这份结果里还没有可以计算的答案。你选了很多「说不好」，这本身也是一种诚实的回答——认识三个月，本来就有很多事还看不清。所以下面不会出现任何分数，只把你已经确定的部分列出来。';
      }
      return '你给出的有效答案还不足以支撑一个总分（有效方面 ' + result.validDims + ' 个，有效题目 ' + result.validItems + ' 题）。所以这份结果不计算总体指数，只呈现你已经答过的部分。';
    }
    if (result.coverage >= 85) {
      return '你给了几乎每个方面一个明确的回答，所以下面这些推断有比较完整的依据。但依据再完整，它描述的也只是你此刻看到的样子。';
    }
    if (result.coverage >= 70) {
      return '大部分方面你都答得很清楚，只有少数几个留了「说不好」。我把那些空白也保留在报告里了，因为空白本身也是信息。';
    }
    return '有相当一部分方面还说不准，所以下面的结论只能当作一个粗略的轮廓，不必把它当成定论。';
  }

  function buildReport(result) {
    var dims = result.dims;
    var known = sortedDims(dims, function (d) { return d.percent !== null; });
    var unknown = dims.filter(function (d) { return d.percent === null; });
    var byId = {};
    dims.forEach(function (d) { byId[d.id] = d; });
    var high = known.filter(function (d) { return d.level === 'high'; });
    var mid = known.filter(function (d) { return d.level === 'mid'; });
    var low = known.filter(function (d) { return d.level === 'low'; });

    /* 1. 能说明什么 */
    var canSay = [];
    if (known.length) {
      var top = known.slice(0, 2);
      canSay.push('在这份答卷里，最确定的是' + joinNames(top, '和') + '。' +
        '「' + top[0].name + '」拿到了 ' + top[0].percent + ' 分：' + top[0].text[top[0].level]);
      if (top[1]) {
        canSay.push('「' + top[1].name + '」是 ' + top[1].percent + ' 分：' + top[1].text[top[1].level]);
      }
      canSay.push('这两项加起来说明的是：这段关系在你这边已经有实感，不是「认识但不算熟」的状态。注意，这是你的视角，不是{ta}的。');
    } else {
      canSay.push('目前还没有哪个方面是你能确定的。这不是坏消息，只说明现在还不是下判断的时候。');
    }

    /* 2. 还不确定 */
    var unsure = [];
    if (unknown.length) {
      unsure.push('有 ' + unknown.length + ' 个方面完全没有计入：' + joinNames(unknown, '、') + '。它们没有进指数，也没有被当成 0 分或满分。');
    }
    if (result.unknownItems > 0) {
      unsure.push('一共有 ' + result.unknownItems + ' 道题选了「说不好 / 还没经历过」。这些题既没有被当成 0 分，也没有被当成满分，只是被放进了空白里。');
      unsure.push('空白本身也是信息：它提醒你，这段关系里还有一部分，你还没看清楚，或者还没发生。');
    } else {
      unsure.push('二十道题你都给了明确回答，所以这份结果在数据上是完整的。');
    }
    if (mid.length) {
      unsure.push('另外有些方面停在中间，比如「' + mid[0].name + '」（' + mid[0].percent + ' 分）。它更像「正在长成」，而不是「不够好」——三个月的关系，大部分方面本来就应该在这个位置。');
    }

    /* 3. 值得珍惜 */
    var cherish = [];
    var cherishOrder = ['memory', 'meeting', 'trust', 'support', 'ease'];
    var hit = null;
    for (var i = 0; i < cherishOrder.length; i++) {
      var d = dims.filter(function (x) { return x.id === cherishOrder[i]; })[0];
      if (d && d.percent !== null && d.percent >= 65) { hit = d; break; }
    }
    if (hit) {
      cherish.push('「' + hit.name + '」是这段时间里比较扎实的一块（' + hit.percent + ' 分）。' + hit.text[hit.level]);
    }
    if (high.length >= 3) {
      cherish.push('你有 ' + high.length + ' 个方面到了 70 分以上：' + joinNames(high, '、') + '。这些不是客套话算出来的，是你一道道选出来的。');
    }
    if (!cherish.length) {
      cherish.push('如果暂时找不到「很扎实」的部分，那也正常。值得珍惜的还有一件事：你愿意花几分钟，认真回答这二十个问题。愿意认真看待一段关系，本身就不常见。');
    }
    cherish.push('还有一件事不会因为以后怎样而被抵消：这三个月是真实发生过的。');

    /* 4. 需要继续经营 */
    var work = [];
    var lowNames = low.map(function (x) { return '「' + x.name + '」'; });
    if (low.length) {
      work.push('分数偏低的是' + lowNames.join('、') + '。这些不是缺点，只是还没长出来的部分。');
      low.slice(0, 2).forEach(function (x) {
        work.push('关于「' + x.name + '」：' + x.tip);
      });
    } else {
      work.push('没有哪个方面明显偏低。这时候更值得注意的不是「哪里不够」，而是「别把它当成理所当然」。');
      var weakest = known[known.length - 1];
      if (weakest && weakest.percent < 95) {
        work.push('如果一定要挑一个，相对最低的是「' + weakest.name + '」（' + weakest.percent + ' 分）。' + weakest.tip);
      }
    }

    /* 5. 距离对友情的潜在影响 */
    var dist = [];
    var dv = byId.future, cv = byId.daily, uv = byId.understanding;
    if (dv && dv.percent !== null && dv.percent < 50) {
      dist.push('你对「隔着距离还能不能维持」是有怀疑的（「未来联系意愿」' + dv.percent + ' 分）。这个怀疑不需要被说服，但可以被验证：先维持一个低成本的联系节奏，过几个月再回头看它还在不在。');
    }
    if (cv && cv.percent !== null && cv.percent < 50) {
      dist.push('你们现在的联系本来就不算密（「日常联系」' + cv.percent + ' 分）。距离拉远之后，空白会更明显——异地对低频联系的消耗，比同城大得多。');
    }
    if (uv && uv.percent !== null && uv.percent < 55) {
      dist.push('如果有些话不太容易说清（「相互理解」' + uv.percent + ' 分），异地会更难一点：同城可以用见一面把情绪盖过去，异地没有这个选项。');
    }
    if (!dist.length) {
      dist.push('以你现在的答案看，距离最大的挑战不是感情不够，而是节奏会变：同城时见面是默认选项，异地时见面需要专门安排，很多关系就是在这种「需要安排」里慢慢松掉的。');
    }
    dist.push('这些都不是必然会发生的事。提前知道它们可能出现在哪里，比事后才发现要好。');

    /* 6. 三种情景的一句话摘要 */
    var scen = FJ.SCENARIOS.map(function (s) {
      return { id: s.id, name: s.name, color: s.color, tag: s.tag, summary: s.summary, years: s.nodes.map(function (n) { return n.year; }) };
    });

    /* 6. 结语 */
    var closing;
    if (!result.canScore) {
      closing = '所以这份结果里没有总分。不是系统算不出来，是样本还不足以下结论。等你对这段关系更有把握的时候，可以再回来填一次——那时候的答案，会比现在更像你。';
    } else if (result.band.min >= 80) {
      closing = '这个数字不说明你们「一定」会怎样，它只说明：在你能看到的范围里，这段关系已经长出了比较结实的东西。结实的東西也需要注意别把它放到理所当然的位置。';
    } else if (result.band.min >= 65) {
      closing = '这个数字的意思大概是：底子不错，剩下的交给时间。三个月能走到这里已经不算慢，接下来不需要加速，只需要别停。';
    } else if (result.band.min >= 50) {
      closing = '这个数字不低也不高，它最像「正在长成」的样子。三个月的关系本来就该在这个位置——还没定型，所以也还有很大的空间。';
    } else if (result.band.min >= 35) {
      closing = '这个数字说明你们还在互相认识。这不是坏消息，只是说明现在下结论太早。真正了解一个人，通常比三个月要久。';
    } else {
      closing = '这个数字偏低，但它衡量的是「此刻的连接密度」，不是「这段友情的价值」。有些关系开始得很慢，后来反而很长。';
    }
    closing += ' 分数会变，人会变，唯一确定的是：你刚才认真想过{ta}一次。';

    return {
      lead: lead(result),
      canSay: canSay,
      unsure: unsure,
      cherish: cherish,
      work: work,
      distance: dist,
      scenarios: scen,
      closing: closing
    };
  }

  /* ---------------- 情景与答案的关系（透明说明） ---------------- */
  function basis(result) {
    var pick = ['future', 'longterm', 'daily'];
    var lines = [];
    pick.forEach(function (id) {
      var d = result.dims.filter(function (x) { return x.id === id; })[0];
      if (d && d.percent !== null) {
        lines.push('「' + d.name + '」' + d.percent + ' 分');
      }
    });
    return lines;
  }

  FJ.engine = {
    optionList: optionList,
    chosenOption: chosenOption,
    itemLevel: itemLevel,
    dimById: dimById,
    compute: compute,
    buildReport: buildReport,
    basis: basis,
    MIN_DIMS_FOR_SCORE: MIN_DIMS_FOR_SCORE,
    MIN_ITEMS_FOR_SCORE: MIN_ITEMS_FOR_SCORE
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
