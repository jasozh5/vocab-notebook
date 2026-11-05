(function () {
'use strict';

// ---------- Setup ----------
const KEY = 'vocab-notebook:v2';          // current storage
const OLD_KEY = 'verb-notebook:words';    // first version (verbs only)
const PREF_KEY = 'vocab-notebook:prefs';  // practice mode, last quiz settings
const TYPES = {
  noun: { ko: '명사', en: 'noun', plural: 'Nouns' },
  verb: { ko: '동사', en: 'verb', plural: 'Verbs' },
  desc: { ko: '형용사', en: 'adjective', plural: 'Adjectives' },
  other: { ko: '기타', en: 'other', plural: 'Other' },
};
const conjugates = w => (w.t === 'verb' || w.t === 'desc') && Conj.isVerbish(w.k);
const keyOf = w => w.k + '|' + w.t;
let idSeq = 0;
const newId = () => 'w' + Date.now().toString(36) + (idSeq++).toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// ---------- Storage (this browser only) ----------
let storageOK = true;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.words)) return { words: d.words, topics: Array.isArray(d.topics) ? d.topics : [] }; }
    const old = localStorage.getItem(OLD_KEY);
    if (old) { const arr = JSON.parse(old); if (Array.isArray(arr)) return migrate(arr); }
  } catch (e) { storageOK = false; }
  return { words: DEFAULT_WORDS.map(w => ({ ...w })), topics: [] };
}
// Bring words from the first version forward: add topics and the starter nouns.
function migrate(arr) {
  const defaults = new Map(DEFAULT_WORDS.map(w => [keyOf(w), w]));
  const words = arr.map(w => {
    const o = { ...w };
    if (o.diary) o.star = true; delete o.diary;
    if (!o.topic) { const d = defaults.get(keyOf(o)); o.topic = d ? d.topic : 'Other'; }
    return o;
  });
  const have = new Set(words.map(keyOf));
  DEFAULT_WORDS.forEach(w => { if (!have.has(keyOf(w)) && w.t === 'noun') words.push({ ...w }); });
  return { words, topics: [] };
}
const clean = w => { const o = { ...w }; Object.keys(o).forEach(k => { if (o[k] === '' || o[k] === false || o[k] == null) delete o[k]; }); return o; };
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 2, words: data.words.map(clean), topics: data.topics })); return true; }
  catch (e) { storageOK = false; return false; }
}
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }

const data = load();
data.words.forEach(w => { if (!w.id) w.id = newId(); if (!w.topic) w.topic = 'Other'; });
const prefs = loadPrefs();
const byId = id => data.words.find(w => w.id === id);

function allTopics() {
  const seen = new Set(), out = [];
  const add = t => { if (t && !seen.has(t) && t !== 'Other') { seen.add(t); out.push(t); } };
  DEFAULT_TOPICS.forEach(add); data.topics.forEach(add); data.words.forEach(w => add(w.topic));
  out.push('Other');
  return out;
}
const topicCount = t => data.words.filter(w => w.topic === t).length;

// ---------- Word helpers ----------
const irrOf = w => { const a = conjugates(w) ? Conj.analyze(w.k, w.t, w.irr) : null; return a ? a.irr : ''; };
function basicOf(w) {
  const b = Conj.basic(w.k, w.t, w.irr) || { pres: '', past: '', fut: '' };
  return { pres: w.pres || b.pres, past: w.past || b.past, fut: w.fut || b.fut };
}
const tableOf = w => Conj.table(w.k, w.t, w.irr, { pres: w.pres, past: w.past, fut: w.fut });
function ruleNotes(w) {
  const a = Conj.analyze(w.k, w.t, w.irr); const n = [];
  if (!a) return n;
  if (a.lStem) n.push('ㄹ stem');
  if (a.d.V === 18 && a.d.T === 0 && !a.irr) n.push('ㅡ drops');
  if (a.isHa) n.push('하다 → 해요');
  return n;
}

// ---------- UI state ----------
const ui = {
  tab: location.hash === '#quiz' ? 'quiz' : 'words',
  q: '', filter: 'all', topic: 'all', sort: 'abc',
  editing: null, adding: false,
  quiz: null,
};
let practice = !!prefs.practice;
const app = document.getElementById('app');

// ---------- Words view ----------
function visible() {
  const q = ui.q.trim().toLowerCase();
  const ws = data.words.filter(w => {
    if (['noun', 'verb', 'desc', 'other'].includes(ui.filter) && w.t !== ui.filter) return false;
    if (ui.filter === 'irr' && !irrOf(w)) return false;
    if (ui.filter === 'star' && !w.star) return false;
    if (ui.topic !== 'all' && w.topic !== ui.topic) return false;
    if (!q) return true;
    const f = conjugates(w) ? basicOf(w) : {};
    return [w.k, w.en, f.pres, f.past, f.fut, w.ex, w.exEn, w.topic].some(x => String(x || '').toLowerCase().includes(q));
  });
  if (ui.sort === 'abc') ws.sort((a, b) => a.k.localeCompare(b.k, 'ko'));
  else ws.sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.k.localeCompare(b.k, 'ko'));
  return ws;
}

function wordHead(w) {
  const isC = conjugates(w);
  const chars = [...w.k];
  if (/\s/.test(w.k) || chars.length > 7) return `<div class="bigword" lang="ko">${esc(w.k)}</div>`;
  return `<div class="cells" lang="ko" aria-label="${esc(w.k)}">${chars.map((c, i) => `<span${isC && i === chars.length - 1 ? ' class="da"' : ''}>${esc(c)}</span>`).join('')}</div>`;
}

function card(w) {
  const isC = conjugates(w), irr = irrOf(w);
  const ty = TYPES[w.t] || TYPES.other;
  const tags = [`<span class="tag t-${esc(w.t)}">${ty.ko} · ${ty.en}</span>`, `<span class="tag topic">${esc(w.topic)}</span>`];
  if (irr) tags.push(`<span class="tag irr">${esc(irr)} irregular</span>`);
  if (isC) ruleNotes(w).forEach(n => tags.push(`<span class="tag rule">${esc(n)}</span>`));
  let forms = '';
  if (isC) {
    const f = basicOf(w);
    forms = `<dl class="forms">
      <dt>present</dt><dd class="hide" lang="ko">${esc(f.pres)}</dd>
      <dt>past</dt><dd class="hide" lang="ko">${esc(f.past)}</dd>
      <dt>${w.t === 'desc' ? 'future / guess' : 'future'}</dt><dd class="hide" lang="ko">${esc(f.fut)}</dd>
    </dl>`;
  }
  return `<article class="card" data-id="${esc(w.id)}">
    <div class="head"><div class="hw">${wordHead(w)}<div class="en hide">${esc(w.en)}</div></div><div class="tags">${tags.join('')}</div></div>
    ${forms}
    ${w.ex ? `<div class="ex"><b lang="ko">${esc(w.ex)}</b>${w.exEn ? `<span class="hide">${esc(w.exEn)}</span>` : ''}</div>` : ''}
    <div class="actions">
      <button class="star" type="button" data-act="star" aria-pressed="${!!w.star}" aria-label="${w.star ? 'Unstar' : 'Star'} ${esc(w.k)}">${w.star ? '★' : '☆'}</button>
      <span class="spacer"></span>
      ${isC ? '<button class="btn small" type="button" data-act="conj">All forms</button>' : ''}
      <button class="btn small" type="button" data-act="edit">Edit</button>
      <button class="btn small danger" type="button" data-act="del">Delete</button>
    </div>
  </article>`;
}

function topicOptions(selected, withAll) {
  const ts = allTopics();
  return (withAll ? `<option value="all"${selected === 'all' ? ' selected' : ''}>All topics (${data.words.length})</option>` : '') +
    ts.map(t => `<option value="${esc(t)}"${selected === t ? ' selected' : ''}>${esc(t)}${withAll ? ` (${topicCount(t)})` : ''}</option>`).join('');
}

function formHTML() {
  const w = ui.editing ? byId(ui.editing) : null;
  const defTopic = ui.topic !== 'all' ? ui.topic : (prefs.lastTopic || 'Other');
  const v = w || { k: '', en: '', t: prefs.lastType || 'noun', topic: defTopic, ex: '', exEn: '', star: false };
  const f = w && conjugates(w) ? basicOf(w) : { pres: '', past: '', fut: '' };
  const irrSel = w && w.irr !== undefined ? w.irr : 'auto';
  return `<form class="panel" id="wordform" novalidate>
    <h2>${w ? 'Edit word' : 'Add a word'}</h2>
    <div class="fgrid">
      <div class="f"><label for="ft">Type</label><select id="ft">
        ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${v.t === k ? ' selected' : ''}>${t.ko} · ${t.en}${k === 'other' ? ' (adverb, phrase…)' : ''}</option>`).join('')}
      </select></div>
      <div class="f"><label for="fk">Korean</label><input id="fk" value="${esc(v.k)}" placeholder="e.g. 마시다 or 의자" autocomplete="off" lang="ko"><span class="hint" id="khint"></span></div>
      <div class="f"><label for="fen">Meaning</label><input id="fen" value="${esc(v.en)}" placeholder="e.g. to drink" autocomplete="off"></div>
      <div class="f"><label for="ftopic">Topic</label><select id="ftopic">${topicOptions(v.topic, false)}<option value="__new">+ New topic…</option></select>
        <input id="ftopicnew" placeholder="New topic name" autocomplete="off" hidden></div>
    </div>
    <div class="fgrid" id="conjfields">
      <div class="f"><label for="firr">Irregular</label><select id="firr">
        <option value="auto"${irrSel === 'auto' ? ' selected' : ''}>Auto-detect</option>
        ${['', ...Conj.IRREGULARS].map(o => `<option value="${o}"${irrSel === o ? ' selected' : ''}>${o ? o + ' irregular' : 'Regular'}</option>`).join('')}
      </select><span class="hint" id="irrhint"></span></div>
      <div class="f"><label for="fpres">Present</label><input id="fpres" value="${esc(f.pres)}" lang="ko"></div>
      <div class="f"><label for="fpast">Past</label><input id="fpast" value="${esc(f.past)}" lang="ko"></div>
      <div class="f"><label for="ffut">Future</label><input id="ffut" value="${esc(f.fut)}" lang="ko"></div>
    </div>
    <div class="fgrid">
      <div class="f"><label for="fex">Example sentence</label><input id="fex" value="${esc(v.ex)}" placeholder="커피를 마셨어요." lang="ko"></div>
      <div class="f"><label for="fexen">Example in English</label><input id="fexen" value="${esc(v.exEn)}" placeholder="I drank coffee."></div>
    </div>
    <label class="check"><input type="checkbox" id="fstar"${v.star ? ' checked' : ''}> ★ Star this word for extra review</label>
    <div id="formerr" class="notice" hidden></div>
    <div class="row"><button class="btn primary" type="submit">${w ? 'Save changes' : 'Add word'}</button><button class="btn" type="button" id="cancel">Cancel</button></div>
  </form>`;
}

function wordsView() {
  const chips = [['all', 'All'], ['noun', '명사 Nouns'], ['verb', '동사 Verbs'], ['desc', '형용사 Adjectives'], ['other', 'Other'], ['irr', 'Irregular'], ['star', '★ Starred']];
  return `<main class="wrap">
    <div class="bar">
      ${storageOK ? '' : '<div class="notice">This browser is blocking storage (private mode?), so changes won\'t be kept. Use Export to save a copy.</div>'}
      <div class="row">
        <input type="search" id="q" placeholder="Search Korean or English" value="${esc(ui.q)}" autocomplete="off" aria-label="Search words">
        <button class="btn primary" id="addbtn" type="button">+ Add word</button>
      </div>
      <div class="row">
        <label class="sr" for="topicsel">Topic</label>
        <select id="topicsel" class="sel">${topicOptions(ui.topic, true)}</select>
        ${chips.map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join('')}
      </div>
      <div class="row">
        <span class="stats" id="count"></span>
        <span class="spacer"></span>
        <button class="chip" type="button" id="sortbtn">${ui.sort === 'abc' ? 'Sort: 가나다' : 'Sort: newest'}</button>
        <button class="chip" type="button" id="practicebtn" aria-pressed="${practice}">Practice mode</button>
      </div>
      ${practice ? '<div class="stats">Meanings and forms are hidden. Say them out loud, then tap a card to check.</div>' : ''}
    </div>
    ${ui.adding || ui.editing ? formHTML() : ''}
    <div class="list" id="list"></div>
  </main>
  <footer class="wrap foot">
    <div class="row"><button class="btn" type="button" id="exportbtn">Export backup</button><button class="btn" type="button" id="importbtn">Import backup</button></div>
    <p>Words are saved in this browser on this device. Export a backup now and then, and use Import to move words to another device.</p>
  </footer>`;
}

// Updates only the list, so typing in search (and Korean IME composition) isn't interrupted.
function renderList() {
  const list = document.getElementById('list'); if (!list) return;
  const ws = visible();
  list.innerHTML = ws.length ? ws.map(card).join('') : `<div class="empty">No words here yet. Try another search or topic, or add one with “+ Add word”.</div>`;
  const c = document.getElementById('count');
  if (c) c.textContent = ws.length === data.words.length ? `${ws.length} words` : `${ws.length} of ${data.words.length} words`;
}

// ---------- All-forms dialog ----------
function openConj(w) {
  const dlg = document.getElementById('conjdlg');
  const ty = TYPES[w.t];
  dlg.innerHTML = `<div class="dlg">
    <div class="dlg-head">
      <div><div class="dlg-word" lang="ko">${esc(w.k)}</div><div class="en">${esc(w.en)} · <span class="muted">${ty.ko} ${ty.en}${irrOf(w) ? ` · ${esc(irrOf(w))} irregular` : ''}</span></div></div>
      <button class="btn small" type="button" id="dlgclose">Close</button>
    </div>
    ${tableOf(w).map(s => `<section class="csec"><h3>${esc(s.title)}</h3><table class="ctab"><tbody>
      ${s.rows.map(r => `<tr><th scope="row">${esc(r.label)}${r.pattern ? `<small lang="ko">${esc(r.pattern)}</small>` : ''}</th><td><span lang="ko">${esc(r.form)}</span>${r.note ? `<small>${esc(r.note)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></section>`).join('')}
    <p class="muted small">Forms are generated by rules. If one looks wrong, fix the present, past or future with Edit, or set the irregular type.</p>
  </div>`;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  document.getElementById('dlgclose').onclick = closeConj;
}
function closeConj() { const dlg = document.getElementById('conjdlg'); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

// ---------- Quiz ----------
const QUIZ_MODES = {
  k2e: { label: 'Korean → English', hint: 'See the Korean word, pick the meaning' },
  e2k: { label: 'English → Korean', hint: 'See the meaning, pick the Korean word' },
  e2kt: { label: 'English → Korean (typed)', hint: 'See the meaning, type the Korean word' },
  conj: { label: 'Conjugation', hint: 'Type the right form of a verb or adjective' },
};
const FORM_SETS = {
  basic: { label: 'Basics: present, past, future', ids: ['pres', 'past', 'fut'] },
  everyday: { label: 'Everyday: + formal, casual, honorific, negative, want/can, connectors', ids: ['pres', 'past', 'fut', 'f_pres', 'f_past', 'c_pres', 'c_past', 'h_pres', 'n_pres', 'n_long', 'want', 'can', 'please', 'and', 'but', 'if', 'so', 'because', 'm_pres', 'm_past'] },
  all: { label: 'Every form in the table', ids: null },
};
const SKIP_IN_QUIZ = new Set(['q', 'f_q', 'n_none']);
const defaultSetup = () => ({ mode: 'k2e', topic: 'all', type: 'all', starOnly: false, count: 10, forms: 'basic' });
const setup = Object.assign(defaultSetup(), prefs.quiz || {});

function quizPool(s) {
  return data.words.filter(w => {
    if (s.topic !== 'all' && w.topic !== s.topic) return false;
    if (s.type !== 'all' && w.t !== s.type) return false;
    if (s.starOnly && !w.star) return false;
    if (s.mode === 'conj' && !conjugates(w)) return false;
    return true;
  });
}
// Words missed more often (and practiced less) come up more.
const weight = w => { const st = w.stats || {}; return (1 + 2 * (st.m || 0)) / (1 + 0.5 * (st.r || 0)); };
function pickWeighted(list) {
  const total = list.reduce((s, w) => s + weight(w), 0);
  let x = Math.random() * total;
  for (const w of list) { x -= weight(w); if (x <= 0) return w; }
  return list[list.length - 1];
}
function conjRows(w, setKey) {
  const rows = [];
  tableOf(w).forEach(s => s.rows.forEach(r => { if (!SKIP_IN_QUIZ.has(r.id)) rows.push({ ...r, sec: s.title.split(' · ')[0].split(' (')[0] }); }));
  const ids = FORM_SETS[setKey].ids;
  return ids ? rows.filter(r => ids.includes(r.id)) : rows;
}
function distractors(w, field, n) {
  const avoid = new Set([w[field]]);
  const same = shuffle(data.words.filter(x => x.id !== w.id && x.t === w.t));
  const rest = shuffle(data.words.filter(x => x.id !== w.id && x.t !== w.t));
  const out = [];
  for (const x of same.concat(rest)) { if (out.length >= n) break; if (!avoid.has(x[field])) { avoid.add(x[field]); out.push(x[field]); } }
  return out;
}
function buildQuiz(s) {
  const pool = quizPool(s), qs = [];
  if (s.mode === 'conj') {
    const used = new Set(); let tries = 0;
    while (qs.length < s.count && tries++ < s.count * 30 && pool.length) {
      const w = pickWeighted(pool), rows = conjRows(w, s.forms);
      if (!rows.length) continue;
      const r = rows[Math.floor(Math.random() * rows.length)];
      if (used.has(w.id + r.id)) continue;
      used.add(w.id + r.id);
      qs.push({ wid: w.id, kind: 'conj', label: r.label, sec: r.sec, pattern: r.pattern, answer: r.form, note: r.note });
    }
  } else {
    const left = pool.slice();
    while (qs.length < s.count && left.length) {
      const w = pickWeighted(left); left.splice(left.indexOf(w), 1);
      if (s.mode === 'e2kt') { qs.push({ wid: w.id, kind: 'e2kt', answer: w.k }); continue; }
      const field = s.mode === 'k2e' ? 'en' : 'k';
      qs.push({ wid: w.id, kind: s.mode, answer: w[field], options: shuffle([w[field], ...distractors(w, field, 3)]) });
    }
  }
  return qs;
}
const norm = s => String(s || '').replace(/[\s?.!~,。]/g, '').normalize('NFC');
const isTyped = q => q.kind === 'conj' || q.kind === 'e2kt';
function startQuiz(qs) { ui.quiz = { qs, i: 0, score: 0, answered: null, results: [] }; render(); }
function record(w, right) { w.stats = w.stats || { r: 0, m: 0 }; if (right) w.stats.r++; else w.stats.m++; persist(); }
function answer(given) {
  const z = ui.quiz, q = z.qs[z.i], w = byId(q.wid);
  if (!w || z.answered) return;
  const right = isTyped(q) ? norm(given) === norm(q.answer) : given === q.answer;
  z.answered = { given, right };
  if (right) z.score++;
  z.results.push({ q, given, right });
  record(w, right);
  render();
}
function overrideRight() {
  const z = ui.quiz; if (!z.answered || z.answered.right) return;
  const w = byId(z.qs[z.i].wid);
  z.answered.right = true; z.score++; z.results[z.results.length - 1].right = true;
  if (w && w.stats) { w.stats.m = Math.max(0, w.stats.m - 1); w.stats.r++; persist(); }
  render();
}
function nextQ() { const z = ui.quiz; z.i++; z.answered = null; render(); }

function quizSetupView() {
  const pool = quizPool(setup);
  const enoughForMC = setup.mode === 'conj' || data.words.length >= 2;
  const can = pool.length > 0 && enoughForMC;
  const n = setup.mode === 'conj' ? setup.count : Math.min(setup.count, pool.length);
  const typeOpts = [['all', 'All types'], ...Object.entries(TYPES).filter(([k]) => setup.mode !== 'conj' || k === 'verb' || k === 'desc').map(([k, t]) => [k, `${t.ko} ${t.plural}`])];
  if (setup.mode === 'conj' && !['all', 'verb', 'desc'].includes(setup.type)) setup.type = 'all';
  return `<main class="wrap"><form class="panel quizsetup" id="quizsetup">
    <h2>Quiz</h2>
    <fieldset class="modes"><legend class="lbl">What to practice</legend>
      ${Object.entries(QUIZ_MODES).map(([k, m]) => `<label class="mode${setup.mode === k ? ' on' : ''}"><input type="radio" name="mode" value="${k}"${setup.mode === k ? ' checked' : ''}><b>${m.label}</b><span>${m.hint}</span></label>`).join('')}
    </fieldset>
    <div class="fgrid">
      <div class="f"><label for="qtopic">Topic</label><select id="qtopic">${topicOptions(setup.topic, true)}</select></div>
      <div class="f"><label for="qtype">Word type</label><select id="qtype">${typeOpts.map(([k, l]) => `<option value="${k}"${setup.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label for="qcount">Questions</label><select id="qcount">${[5, 10, 20, 30].map(c => `<option value="${c}"${setup.count === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      ${setup.mode === 'conj' ? `<div class="f"><label for="qforms">Forms</label><select id="qforms">${Object.entries(FORM_SETS).map(([k, f]) => `<option value="${k}"${setup.forms === k ? ' selected' : ''}>${f.label}</option>`).join('')}</select></div>` : ''}
    </div>
    <label class="check"><input type="checkbox" id="qstar"${setup.starOnly ? ' checked' : ''}> ★ Starred words only</label>
    <div class="row">
      <button class="btn primary" type="submit"${can ? '' : ' disabled'}>Start quiz</button>
      <span class="stats">${can ? `${n} question${n === 1 ? '' : 's'} from ${pool.length} word${pool.length === 1 ? '' : 's'}. Words you miss come up more often.` : 'No words match these settings. Pick another topic or type, or turn off “Starred only”.'}</span>
    </div>
  </form></main>`;
}

function quizQuestionView() {
  const z = ui.quiz, q = z.qs[z.i], w = byId(q.wid);
  if (!w) { nextQ(); return ''; }
  const done = !!z.answered;
  const head = `<div class="qhead"><span>Question ${z.i + 1} of ${z.qs.length}</span><span>Score ${z.score}</span><button class="btn small" type="button" id="quitquiz">End quiz</button></div>
    <div class="progress"><span style="width:${(z.i / z.qs.length) * 100}%"></span></div>`;
  let body;
  const typedForm = `<form id="typedform" class="typed" autocomplete="off">
        <input id="typed" lang="ko" placeholder="Type in Korean" ${done ? 'disabled' : ''} value="${done ? esc(z.answered.given) : ''}" aria-label="Your answer">
        ${done ? '' : '<button class="btn primary" type="submit">Check</button><button class="btn" type="button" id="giveup">Show answer</button>'}
      </form>`;
  if (q.kind === 'conj') {
    body = `<div class="prompt"><div class="pword" lang="ko">${esc(w.k)}</div><div class="en">${esc(w.en)}</div>
      <div class="ask"><span class="tag topic">${esc(q.sec)}</span> <b>${esc(q.label)}</b> <span class="muted" lang="ko">${esc(q.pattern)}</span></div></div>
      ${typedForm}`;
    if (done) body += feedback(z.answered.right, `<span lang="ko">${esc(q.answer)}</span>`, q.note, w);
  } else if (q.kind === 'e2kt') {
    const ty = TYPES[w.t] || TYPES.other;
    body = `<div class="prompt"><div class="pword en-prompt">${esc(w.en)}</div>
      <div class="ask"><span class="tag t-${esc(w.t)}">${ty.ko} · ${ty.en}</span> <span class="tag topic">${esc(w.topic)}</span></div></div>
      ${typedForm}`;
    if (done) body += feedback(z.answered.right, `<span lang="ko">${esc(q.answer)}</span>`, null, w);
  } else {
    const prompt = q.kind === 'k2e' ? `<div class="pword" lang="ko">${esc(w.k)}</div><div class="muted">What does this mean?</div>` : `<div class="pword en-prompt">${esc(w.en)}</div><div class="muted">Which Korean word is this?</div>`;
    body = `<div class="prompt">${prompt}</div><div class="opts">
      ${q.options.map((o, i) => {
        let cls = 'opt';
        if (done && o === q.answer) cls += ' right';
        else if (done && o === z.answered.given) cls += ' wrong';
        return `<button class="${cls}" type="button" data-opt="${i}" ${done ? 'disabled' : ''}${q.kind === 'e2k' ? ' lang="ko"' : ''}><kbd>${i + 1}</kbd>${esc(o)}</button>`;
      }).join('')}</div>`;
    if (done) body += feedback(z.answered.right, esc(q.kind === 'k2e' ? w.en : w.k), null, w);
  }
  return `<main class="wrap"><div class="panel quiz">${head}${body}</div></main>`;
}
function feedback(right, answerHTML, note, w) {
  const z = ui.quiz, q = z.qs[z.i];
  return `<div class="fb ${right ? 'ok' : 'bad'}" role="status">
    <b>${right ? '맞아요! Correct.' : (z.answered.given ? 'Not quite.' : 'Here’s the answer.')}</b>
    ${right && !isTyped(q) ? '' : `<div>Answer: <span class="ans">${answerHTML}</span></div>`}
    ${note ? `<div class="muted small">${esc(note)}</div>` : ''}
    ${w.ex ? `<div class="ex"><b lang="ko">${esc(w.ex)}</b>${w.exEn ? esc(w.exEn) : ''}</div>` : ''}
    <div class="row">
      <button class="btn primary" type="button" id="nextq">${z.i + 1 < z.qs.length ? 'Next' : 'See results'}</button>
      ${!right && isTyped(q) && z.answered.given ? '<button class="btn" type="button" id="overridebtn">I was right, count it</button>' : ''}
    </div>
  </div>`;
}

function quizResultsView() {
  const z = ui.quiz, total = z.qs.length, pct = total ? Math.round((z.score / total) * 100) : 0;
  const missed = z.results.filter(r => !r.right);
  const line = r => {
    const w = byId(r.q.wid); if (!w) return '';
    const what = r.q.kind === 'conj' ? `${esc(w.k)} · ${esc(r.q.label)} (${esc(r.q.sec)})` : (r.q.kind === 'k2e' ? esc(w.k) : esc(w.en));
    return `<li class="${r.right ? 'ok' : 'bad'}"><span class="mark">${r.right ? '✓' : '✗'}</span><span><span lang="ko">${what}</span> → <b lang="ko">${esc(r.q.answer)}</b>${!r.right && r.given ? ` <span class="muted">(you: <span lang="ko">${esc(r.given)}</span>)</span>` : ''}</span></li>`;
  };
  return `<main class="wrap"><div class="panel quiz">
    <div class="score"><span class="big">${z.score}<small> / ${total}</small></span><span>${pct}%${pct === 100 ? ' · 완벽해요!' : pct >= 80 ? ' · 잘했어요!' : ''}</span></div>
    <ul class="results">${z.results.map(line).join('')}</ul>
    <div class="row">
      ${missed.length ? '<button class="btn primary" type="button" id="retrymissed">Retry the ones I missed</button><button class="btn" type="button" id="starmissed">★ Star missed words</button>' : ''}
      <button class="btn${missed.length ? '' : ' primary'}" type="button" id="again">Same settings again</button>
      <button class="btn" type="button" id="newquiz">Change settings</button>
    </div>
  </div></main>`;
}

function quizView() {
  if (!ui.quiz) return quizSetupView();
  if (ui.quiz.i >= ui.quiz.qs.length) return quizResultsView();
  return quizQuestionView();
}

// ---------- Main render ----------
function render() {
  const all = data.words, count = t => all.filter(w => w.t === t).length;
  const focusId = document.activeElement && document.activeElement.id;
  app.innerHTML = `
  <header class="top"><div class="wrap">
    <h1>단어장<small>Korean vocabulary notebook</small></h1>
    <div class="stats">${all.length} words · ${count('noun')} nouns · ${count('verb')} verbs · ${count('desc')} adjectives${count('other') ? ` · ${count('other')} other` : ''}</div>
    <nav class="tabs" aria-label="Sections">
      <a href="#words" class="tab" ${ui.tab === 'words' ? 'aria-current="page"' : ''}>단어 Words</a>
      <a href="#quiz" class="tab" ${ui.tab === 'quiz' ? 'aria-current="page"' : ''}>퀴즈 Quiz</a>
    </nav>
  </div></header>
  ${ui.tab === 'quiz' ? quizView() : wordsView()}`;
  document.body.classList.toggle('practice', practice && ui.tab === 'words');
  if (ui.tab === 'words') {
    renderList();
    if (focusId === 'q') { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    if (ui.adding || ui.editing) wireForm();
  } else if (ui.quiz && ui.quiz.i < ui.quiz.qs.length) {
    const el = ui.quiz.answered ? document.getElementById('nextq') : document.getElementById('typed');
    if (el) el.focus({ preventScroll: true });
  }
}

function wireForm() {
  const $ = id => document.getElementById(id);
  const isEdit = !!ui.editing;
  const dirty = { pres: isEdit, past: isEdit, fut: isEdit };
  ['pres', 'past', 'fut'].forEach(k => $('f' + k).addEventListener('input', () => dirty[k] = true));
  const refresh = () => {
    const k = $('fk').value.trim(), t = $('ft').value, sel = $('firr').value;
    const isC = t === 'verb' || t === 'desc';
    $('conjfields').hidden = !isC;
    $('khint').textContent = isC ? 'Dictionary form, ending in 다. Forms fill in automatically.'
      : (/다$/.test(k) && k.length > 1 ? 'Ends in 다. Is this a verb or adjective? Change Type to get conjugations.' : '');
    if (!isC) return;
    const a = Conj.analyze(k, t, sel);
    $('irrhint').textContent = sel === 'auto' && a ? (a.irr ? `Looks like ${a.irr} irregular` : 'Looks regular') : '';
    const b = Conj.basic(k, t, sel);
    if (b) ['pres', 'past', 'fut'].forEach(x => { if (!dirty[x]) $('f' + x).value = b[x]; });
  };
  $('fk').addEventListener('input', () => { if (!isEdit) dirty.pres = dirty.past = dirty.fut = false; refresh(); });
  $('ft').addEventListener('change', () => { dirty.pres = dirty.past = dirty.fut = false; refresh(); });
  $('firr').addEventListener('change', () => { dirty.pres = dirty.past = dirty.fut = false; refresh(); });
  $('ftopic').addEventListener('change', () => { $('ftopicnew').hidden = $('ftopic').value !== '__new'; if (!$('ftopicnew').hidden) $('ftopicnew').focus(); });
  refresh();
  $('cancel').onclick = () => { ui.adding = false; ui.editing = null; render(); };
  $('wordform').addEventListener('submit', e => {
    e.preventDefault();
    const k = $('fk').value.trim(), en = $('fen').value.trim(), t = $('ft').value, sel = $('firr').value;
    const err = $('formerr');
    const fail = msg => { err.hidden = false; err.textContent = msg; };
    const isC = t === 'verb' || t === 'desc';
    if (!k) return fail('Type the Korean word.');
    if (isC && !Conj.isVerbish(k)) return fail('Verbs and adjectives need the dictionary form, ending in 다 (for example 마시다).');
    if (!en) return fail('Add an English meaning so it can be quizzed.');
    let topic = $('ftopic').value;
    if (topic === '__new') {
      topic = $('ftopicnew').value.trim();
      if (!topic) return fail('Name the new topic, or pick an existing one.');
      if (!allTopics().includes(topic)) data.topics.push(topic);
    }
    if (data.words.some(x => x.k === k && x.t === t && x.id !== ui.editing)) return fail(`${k} is already in the notebook. Use Edit on that card instead.`);
    const isNew = !isEdit;
    const w = isNew ? { id: newId(), added: new Date().toISOString().slice(0, 10) } : byId(ui.editing);
    Object.assign(w, { k, en, t, topic, ex: $('fex').value.trim(), exEn: $('fexen').value.trim(), star: $('fstar').checked });
    delete w.irr; delete w.pres; delete w.past; delete w.fut;
    if (isC) {
      if (sel !== 'auto') w.irr = sel;
      const b = Conj.basic(k, t, w.irr) || {};
      ['pres', 'past', 'fut'].forEach(x => { const val = $('f' + x).value.trim(); if (val && val !== b[x]) w[x] = val; });
    }
    if (isNew) { data.words.push(w); ui.sort = 'new'; }
    prefs.lastType = t; prefs.lastTopic = topic; savePrefs();
    ui.adding = false; ui.editing = null; ui.q = '';
    render(); save(`Saved ${w.k}`);
  });
  $('fk').focus();
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 2600);
}
function save(msg) { if (persist()) { if (msg) toast(msg); } else { toast('Couldn\'t save in this browser. Export a backup.'); render(); } }

// ---------- Backup ----------
function exportBackup() {
  const out = JSON.stringify({ app: 'vocab-notebook', version: 2, exported: new Date().toISOString(), topics: data.topics, words: data.words.map(w => { const o = clean(w); delete o.id; return o; }) }, null, 2);
  const url = URL.createObjectURL(new Blob([out], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `vocab-notebook-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${data.words.length} words`);
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    let d; try { d = JSON.parse(r.result); } catch (e) { d = null; }
    let incoming = Array.isArray(d) ? d : d && d.words;
    if (!Array.isArray(incoming)) { toast('That file isn\'t a notebook backup.'); return; }
    if (d && Array.isArray(d.topics)) d.topics.forEach(t => { if (typeof t === 'string' && !allTopics().includes(t)) data.topics.push(t); });
    incoming = incoming.filter(w => w && typeof w.k === 'string' && w.k.trim() && typeof w.en === 'string');
    let added = 0, updated = 0;
    incoming.forEach(w0 => {
      const w = { ...w0 };
      if (w.diary) w.star = true; delete w.diary;
      w.t = TYPES[w.t] ? w.t : 'other'; w.topic = w.topic || 'Other';
      const existing = data.words.find(x => keyOf(x) === keyOf(w));
      if (existing) { Object.assign(existing, w, { id: existing.id }); updated++; }
      else { data.words.push({ ...w, id: newId() }); added++; }
    });
    render(); save(`Imported: ${added} new, ${updated} updated`);
  };
  r.readAsText(file);
}
const fileInput = document.getElementById('importfile');
fileInput.addEventListener('change', () => { if (fileInput.files[0]) importBackup(fileInput.files[0]); fileInput.value = ''; });

// ---------- Events ----------
window.addEventListener('hashchange', () => { ui.tab = location.hash === '#quiz' ? 'quiz' : 'words'; render(); window.scrollTo({ top: 0 }); });

app.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; renderList(); }
});
app.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'topicsel') { ui.topic = e.target.value; renderList(); return; }
  if (e.target.closest('#quizsetup')) {
    if (e.target.name === 'mode') setup.mode = e.target.value;
    if (id === 'qtopic') setup.topic = e.target.value;
    if (id === 'qtype') setup.type = e.target.value;
    if (id === 'qcount') setup.count = +e.target.value;
    if (id === 'qforms') setup.forms = e.target.value;
    if (id === 'qstar') setup.starOnly = e.target.checked;
    prefs.quiz = { ...setup }; savePrefs(); render();
  }
});
app.addEventListener('submit', e => {
  if (e.target.id === 'quizsetup') { e.preventDefault(); const qs = buildQuiz(setup); if (qs.length) startQuiz(qs); return; }
  if (e.target.id === 'typedform') { e.preventDefault(); const v = document.getElementById('typed').value; if (v.trim()) answer(v.trim()); return; }
});
app.addEventListener('click', e => {
  const t = e.target.closest('button,.card'); if (!t) return;
  // words view
  if (t.dataset.filter) { ui.filter = t.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === ui.filter)); renderList(); return; }
  if (t.id === 'addbtn') { ui.adding = true; ui.editing = null; render(); window.scrollTo({ top: 0 }); return; }
  if (t.id === 'sortbtn') { ui.sort = ui.sort === 'abc' ? 'new' : 'abc'; t.textContent = ui.sort === 'abc' ? 'Sort: 가나다' : 'Sort: newest'; renderList(); return; }
  if (t.id === 'practicebtn') { practice = !practice; prefs.practice = practice; savePrefs(); render(); return; }
  if (t.id === 'exportbtn') { exportBackup(); return; }
  if (t.id === 'importbtn') { fileInput.click(); return; }
  const cardEl = e.target.closest('.card');
  const w = cardEl && byId(cardEl.dataset.id);
  if (t.dataset.act === 'star' && w) { w.star = !w.star; renderList(); save(w.star ? `Starred ${w.k}` : `Unstarred ${w.k}`); return; }
  if (t.dataset.act === 'conj' && w) { openConj(w); return; }
  if (t.dataset.act === 'edit' && w) { ui.editing = w.id; ui.adding = false; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.act === 'del' && w) {
    if (t.dataset.armed) { data.words = data.words.filter(x => x.id !== w.id); renderList(); save(`Deleted ${w.k}`); return; }
    t.dataset.armed = '1'; t.textContent = 'Tap again to delete';
    setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = 'Delete'; } }, 3000); return;
  }
  if (cardEl && practice && !e.target.closest('button')) { cardEl.classList.toggle('revealed'); return; }
  // quiz
  if (t.dataset.opt !== undefined && ui.quiz) { const q = ui.quiz.qs[ui.quiz.i]; answer(q.options[+t.dataset.opt]); return; }
  if (t.id === 'giveup') { answer(''); return; }
  if (t.id === 'nextq') { nextQ(); return; }
  if (t.id === 'overridebtn') { overrideRight(); return; }
  if (t.id === 'quitquiz') { if (!ui.quiz.results.length) { ui.quiz = null; render(); return; } ui.quiz.qs = ui.quiz.qs.slice(0, ui.quiz.i + (ui.quiz.answered ? 1 : 0)); ui.quiz.i = ui.quiz.qs.length; render(); return; }
  if (t.id === 'retrymissed') { startQuiz(shuffle(ui.quiz.results.filter(r => !r.right).map(r => r.q))); return; }
  if (t.id === 'starmissed') { let n = 0; ui.quiz.results.filter(r => !r.right).forEach(r => { const x = byId(r.q.wid); if (x && !x.star) { x.star = true; n++; } }); save(n ? `Starred ${n} word${n === 1 ? '' : 's'}` : 'Already starred'); return; }
  if (t.id === 'again') { const qs = buildQuiz(setup); if (qs.length) startQuiz(qs); return; }
  if (t.id === 'newquiz') { ui.quiz = null; render(); return; }
});
// 1–4 to pick an answer, Enter for next
document.addEventListener('keydown', e => {
  if (ui.tab !== 'quiz' || !ui.quiz || ui.quiz.i >= ui.quiz.qs.length) return;
  if (e.target.tagName === 'INPUT' || e.isComposing) return;
  const q = ui.quiz.qs[ui.quiz.i];
  if (!ui.quiz.answered && q.options && /^[1-4]$/.test(e.key) && q.options[+e.key - 1] !== undefined) { e.preventDefault(); answer(q.options[+e.key - 1]); }
});
const dlg = document.getElementById('conjdlg');
dlg.addEventListener('click', e => { if (e.target === dlg) closeConj(); });

render();
})();