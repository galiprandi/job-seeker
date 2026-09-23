/* ea-form.js — Easy Apply form step handler. Runs inside the page.
   Reads window.__EA = { answers: {...}, profile: {...}, personal: {...} }
   Returns JSON string: { page, text } | { done: true, applied } | { done: true, stuck: [...] }
   Used by easy-apply-one.js via evalFile (base64, no interpolation issues). */
(function () {
  var EA = window.__EA || { answers: {}, profile: {}, personal: {} };
  var A = EA.answers || {};

  function dlg() {
    var ds = document.querySelectorAll('dialog[open]');
    for (var i = 0; i < ds.length; i++) {
      if (ds[i].offsetHeight > 100) return ds[i];
    }
    return null;
  }

  var modal = dlg();
  if (!modal) {
    var bt = document.body.innerText;
    if (bt.indexOf('Application submitted') >= 0 || bt.indexOf('was sent') >= 0 ||
        bt.indexOf('application was sent') >= 0) {
      return JSON.stringify({ done: true, applied: true });
    }
    return JSON.stringify({ done: true, applied: false, reason: 'no_modal' });
  }

  var text = modal.innerText || '';
  var pageM = text.match(/(\d+)\s*\/\s*(\d+)\s*pages/);

  // --- helpers ---

  function labelOf(el) {
    var a = (el.getAttribute('aria-label') || '').trim();
    if (a) return a;
    var l = el.closest('label');
    if (l && (l.innerText || '').trim()) return l.innerText.trim();
    var p = el.parentElement;
    for (var k = 0; k < 5 && p; k++) {
      var t = (p.innerText || '').trim();
      if (t.length > 3 && t.length < 300) return t;
      p = p.parentElement;
    }
    return '';
  }

  function questionOf(el) {
    // climb until we get a container that looks like a question (has ? or * or 'required')
    var anc = el.closest('fieldset') || el.parentElement;
    var best = '';
    for (var k = 0; k < 6 && anc; k++) {
      var t = (anc.innerText || '').trim();
      if (t.length > best.length) best = t;
      if ((t.indexOf('?') >= 0 || t.indexOf('*') >= 0) && t.length > 12) break;
      anc = anc.parentElement;
    }
    return best.toLowerCase();
  }

  function setNative(input, value) {
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
    var ns = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    ns.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function optText(input) {
    return ((input.value || '') + ' ' + labelOf(input)).toLowerCase();
  }

  function isWord(input, w) {
    return optText(input).split(/[^a-z\u00f1]+/).filter(Boolean).indexOf(w) >= 0;
  }

  var stuck = [];

  // --- text inputs / textareas ---
  var fields = modal.querySelectorAll('input[type=text], input[type=url], input[type=tel], input:not([type]), textarea');
  var company = A.current_company || '';
  var salary = A.salary_usd ? (A.salary_usd_max ? A.salary_usd + '-' + A.salary_usd_max : A.salary_usd) : '';
  var city = A.location || EA.personal.city || '';
  var notice = A.notice_period || '';
  var engExp = A.years_experience || A.engineering_experience || '';
  var aiExp = A.ai_experience || '';
  var pyExp = A.python_experience || '';
  var awsExp = A.aws_experience || '';
  var linkedin = A.linkedin_url || '';
  var blog = A.blog_url || '';
  var github = EA.profile.github || '';
  var comfort = A.english_comfort || '';

  for (var fi = 0; fi < fields.length; fi++) {
    var inp = fields[fi];
    if (inp.type === 'hidden' || inp.offsetHeight === 0) continue;
    if (inp.value) continue;
    var ctx = (labelOf(inp) + ' ' + questionOf(inp)).toLowerCase();
    var v = null;
    if (ctx.indexOf('aws') >= 0 || ctx.indexOf('amazon') >= 0) v = awsExp;
    else if (ctx.indexOf('ai/llm') >= 0 || ctx.indexOf('artificial intelligence') >= 0 ||
             ctx.indexOf('genai') >= 0 || ctx.indexOf('generative') >= 0 || ctx.indexOf('llm') >= 0 ||
             ctx.indexOf('agent') >= 0 || ctx.indexOf('machine learning') >= 0) v = aiExp;
    else if (ctx.indexOf('python') >= 0) v = pyExp;
    else if (ctx.indexOf('typescript') >= 0 || ctx.indexOf('javascript') >= 0 ||
             ctx.indexOf('react') >= 0 || ctx.indexOf('node') >= 0) v = engExp;
    else if (ctx.indexOf('years') >= 0 || ctx.indexOf('experience') >= 0 || ctx.indexOf('engineering') >= 0) v = engExp;
    else if (ctx.indexOf('salary') >= 0 || ctx.indexOf('salarial') >= 0 || ctx.indexOf('sueldo') >= 0 ||
             ctx.indexOf('remunerac') >= 0 || ctx.indexOf('compensation') >= 0 || ctx.indexOf('pretens') >= 0) v = salary;
    else if (ctx.indexOf('city') >= 0 || ctx.indexOf('location') >= 0 || ctx.indexOf('reside') >= 0 ||
             ctx.indexOf('cidade') >= 0 || ctx.indexOf('ubicac') >= 0) v = city;
    else if (ctx.indexOf('notice') >= 0 || ctx.indexOf('availability') >= 0 || ctx.indexOf('start') >= 0 ||
             ctx.indexOf('disponibilidad') >= 0 || ctx.indexOf('incorporac') >= 0 || ctx.indexOf('iniciar') >= 0) v = notice;
    else if (ctx.indexOf('linkedin') >= 0) v = linkedin;
    else if (ctx.indexOf('github') >= 0) v = github;
    else if (ctx.indexOf('website') >= 0 || ctx.indexOf('portfolio') >= 0 || ctx.indexOf('blog') >= 0) v = blog;
    else if (ctx.indexOf('company') >= 0 || ctx.indexOf('employer') >= 0 || ctx.indexOf('empresa') >= 0) v = company;
    else if (ctx.indexOf('comfortable') >= 0 || ctx.indexOf('english') >= 0 || ctx.indexOf('confort') >= 0) v = comfort;

    if (v) {
      setNative(inp, v);
    } else if (inp.hasAttribute('required') || inp.getAttribute('aria-required') === 'true' ||
               questionOf(inp).indexOf('*') >= 0 || questionOf(inp).indexOf('required') >= 0) {
      stuck.push('unanswered_required:' + labelOf(inp).substring(0, 80));
    }
  }

  // --- selects ---
  var sels = modal.querySelectorAll('select');
  for (var si = 0; si < sels.length; si++) {
    var sel = sels[si];
    var q = (labelOf(sel) + ' ' + questionOf(sel)).toLowerCase();
    // Phone country code: always force the user's country (LinkedIn pre-selects the first option)
    if (q.indexOf('phone') >= 0 || q.indexOf('country code') >= 0 || sel.options.length > 50) {
      var ctry = EA.personal.country || '';
      var alreadyOk = sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text.indexOf(ctry) >= 0;
      if (!alreadyOk && ctry) {
        for (var oi = 0; oi < sel.options.length; oi++) {
          if (sel.options[oi].text.indexOf(ctry) >= 0) { sel.selectedIndex = oi; break; }
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      continue;
    }
    var cur = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text.trim() : '';
    if (cur && cur !== 'Select an option' && sel.value) continue;
    var pickRe = null;
    if (q.indexOf('english') >= 0 || q.indexOf('ingl') >= 0) pickRe = /proficient|proficiente|advanced|avan|professional/i;
    else if (q.indexOf('spanish') >= 0 || q.indexOf('espa') >= 0) pickRe = /proficient|proficiente|native|nativo/i;
    else if (q.indexOf('seniority') >= 0) pickRe = /senior|lead|sr/i;
    else if (q.indexOf('disponibilidad') >= 0 || q.indexOf('incorporac') >= 0 || q.indexOf('start date') >= 0) pickRe = /inmediata|immediate/i;
    else if (q.indexOf('reside') >= 0 || q.indexOf('country') >= 0 || q.indexOf('país') >= 0 || q.indexOf('pais') >= 0) {
      var rc = EA.personal.country || '';
      for (var orc = 0; orc < sel.options.length; orc++) {
        if (sel.options[orc].text.trim() === rc || sel.options[orc].text.indexOf(rc) === 0) {
          sel.selectedIndex = orc;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
      continue;
    }
    else if (q.indexOf('years of experience') >= 0 || q.indexOf('years') >= 0) {
      // Pick the highest "N+ Years" option <= user's years for that domain
      var yrs = parseInt(engExp || '0', 10);
      if (q.indexOf('devops') >= 0 || q.indexOf(' qa') >= 0 || q.indexOf('quality') >= 0) yrs = Math.min(yrs, parseInt(awsExp || '3', 10));
      else if (q.indexOf('ai/') >= 0 || q.indexOf(' ai ') >= 0 || q.indexOf('artificial intelligence') >= 0 ||
               q.indexOf('llm') >= 0 || q.indexOf('machine learning') >= 0) yrs = Math.min(yrs, parseInt(aiExp || '0', 10));
      else if (q.indexOf('python') >= 0) yrs = Math.min(yrs, parseInt(pyExp || '0', 10));
      var bestIdx = -1, bestN = -1;
      for (var oy = 0; oy < sel.options.length; oy++) {
        var ym = sel.options[oy].text.match(/(\d+)\s*\+?\s*[Yy]ear/);
        if (ym) { var n = parseInt(ym[1], 10); if (n <= yrs && n > bestN) { bestN = n; bestIdx = oy; } }
      }
      if (bestIdx < 0) { // no numeric options or all > yrs: pick last non-placeholder
        for (var oz = sel.options.length - 1; oz >= 0; oz--) {
          if (sel.options[oz].text.trim() !== 'Select an option' && sel.options[oz].value) { bestIdx = oz; break; }
        }
      }
      if (bestIdx >= 0) {
        sel.selectedIndex = bestIdx;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      continue;
    }
    else if (q.indexOf('rate your') >= 0 || q.indexOf('skill') >= 0 || q.indexOf('proficiency') >= 0) {
      // Skill self-rating: strong for core stack, intermediate otherwise
      if (q.indexOf('typescript') >= 0 || q.indexOf('javascript') >= 0 || q.indexOf('react') >= 0 || q.indexOf('node') >= 0) pickRe = /expert|advanced|avan/i;
      else pickRe = /intermediate|intermedio/i;
    }
    else if (q.indexOf('hear') >= 0 || q.indexOf('ficou sabendo') >= 0 || q.indexOf('source') >= 0) pickRe = /linkedin/i;
    else if (q.indexOf('familiar') >= 0 || q.indexOf('relative') >= 0 || q.indexOf('family') >= 0) pickRe = /^n(ã|a)o$|^no$/i;
    else if (q.indexOf('accessib') >= 0 || q.indexOf('acessibilidade') >= 0) pickRe = /não necessito|do not require|no$|none/i;
    else if (q.indexOf('consent') >= 0 || q.indexOf('consentimento') >= 0 || q.indexOf('agree') >= 0 || q.indexOf('aceito') >= 0 || q.indexOf('concordo') >= 0) pickRe = /aceito|agree|consent|concordo|i have read|yes|sim/i;
    else if (q.indexOf('gender') >= 0 || q.indexOf('gênero') >= 0 || q.indexOf('genero') >= 0) pickRe = /prefer not|homem cis/i;
    else if (q.indexOf('ethnic') >= 0 || q.indexOf('raça') >= 0 || q.indexOf('cor\/raça') >= 0 || q.indexOf('raca') >= 0) pickRe = /do not wish|branca|prefer not/i;
    else if (q.indexOf('disab') >= 0 || q.indexOf('defici') >= 0 || q.indexOf('lgbt') >= 0) pickRe = /^n(ã|a)o$|^no$/i;

    if (pickRe) {
      var found = -1;
      for (var oj = 0; oj < sel.options.length; oj++) {
        var ot = sel.options[oj].text.trim();
        if (ot === 'Select an option' || !sel.options[oj].value) continue;
        if (pickRe.test(ot)) { found = oj; break; }
      }
      if (found < 0) { // last resort: first non-placeholder option
        for (var ok = 0; ok < sel.options.length; ok++) {
          if (sel.options[ok].text.trim() !== 'Select an option' && sel.options[ok].value) { found = ok; break; }
        }
      }
      if (found >= 0) {
        sel.selectedIndex = found;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // --- radios (context-aware yes/no) ---
  var radios = modal.querySelectorAll('input[type=radio]');
  var groups = {};
  for (var ri = 0; ri < radios.length; ri++) {
    var r = radios[ri];
    var n = r.name || 'g' + ri;
    if (!groups[n]) groups[n] = [];
    groups[n].push(r);
  }
  Object.keys(groups).forEach(function (n) {
    var g = groups[n];
    if (g.some(function (x) { return x.checked; })) return;
    var yesN = g.some(function (x) { return isWord(x, 'yes') || isWord(x, 'si') || isWord(x, 'sim'); });
    var noN = g.some(function (x) { return isWord(x, 'no') || isWord(x, 'não') || isWord(x, 'nao'); });
    if (!yesN || !noN) return;
    var q = questionOf(g[0]);
    var want = 'yes';
    if (q.indexOf('disab') >= 0 || q.indexOf('discapac') >= 0 || q.indexOf('defici') >= 0) want = (A.disability || 'no');
    else if (q.indexOf('sponsor') >= 0 || q.indexOf('visa') >= 0) want = (A.sponsorship || 'no');
    else if (q.indexOf('relative') >= 0 || q.indexOf('familiar') >= 0 || q.indexOf('family') >= 0) want = (A.relative_at_company || 'no');
    want = want.toLowerCase();
    var wantMap = { yes: ['yes', 'si', 'sim'], no: ['no', 'não', 'nao'] };
    var targets = wantMap[want] || [want];
    g.forEach(function (x) {
      if (targets.some(function (w) { return isWord(x, w); })) x.click();
    });
  });

  // --- checkboxes: check all unchecked ---
  var cbs = modal.querySelectorAll('input[type=checkbox]');
  for (var ci = 0; ci < cbs.length; ci++) {
    if (!cbs[ci].checked) cbs[ci].click();
  }

  // --- advance: Next / Review / Submit ---
  var btns = modal.querySelectorAll('button');
  var action = null;
  var actionText = '';
  for (var bi = 0; bi < btns.length; bi++) {
    var bt = (btns[bi].textContent || '').trim().toLowerCase();
    if (btns[bi].disabled) continue;
    if (bt === 'submit application' || bt === 'submit' || bt === 'enviar solicitud') { action = btns[bi]; actionText = 'submit'; break; }
  }
  if (!action) {
    for (var bj = 0; bj < btns.length; bj++) {
      var bt2 = (btns[bj].textContent || '').trim().toLowerCase();
      if (btns[bj].disabled) continue;
      if (bt2 === 'review your application' || bt2 === 'review' || bt2 === 'revisar') { action = btns[bj]; actionText = 'review'; break; }
    }
  }
  if (!action) {
    for (var bk = 0; bk < btns.length; bk++) {
      var bt3 = (btns[bk].textContent || '').trim().toLowerCase();
      if (btns[bk].disabled) continue;
      if (bt3 === 'next' || bt3 === 'continue to next step' || bt3 === 'siguiente' || bt3 === 'continue') { action = btns[bk]; actionText = 'next'; break; }
    }
  }
  var clicked = '';
  if (action) { action.click(); clicked = actionText; }

  return JSON.stringify({ done: false, page: pageM ? pageM[1] : '?', text: text.substring(0, 1200), stuck: stuck, clicked: clicked });
})()
