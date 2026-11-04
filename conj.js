// Korean conjugation engine. Works in the browser (global `Conj`) and in Node (module.exports).
(function (root) {
'use strict';

const S = 0xAC00;
const dec = ch => { if (!ch) return null; const c = ch.charCodeAt(0) - S; if (c < 0 || c > 11171) return null; return { L: Math.floor(c / 588), V: Math.floor((c % 588) / 28), T: c % 28 }; };
const com = (L, V, T) => String.fromCharCode(S + L * 588 + V * 28 + T);
const setT = (syl, T) => { const d = dec(syl); return com(d.L, d.V, T); };
const BRIGHT = new Set([0, 2, 8]); // ㅏ ㅑ ㅗ
const T_N = 4, T_L = 8, T_B = 17, T_SS = 20, T_H = 27;
const IRREGULARS = ['ㅂ', 'ㄷ', '르', 'ㅅ', 'ㅎ'];

// Honorific verbs that replace the regular -(으)시- form.
const HONORIFIC = { '먹다': '드시다', '마시다': '드시다', '자다': '주무시다', '말하다': '말씀하시다', '있다': '계시다' };
const HON_NOTE = { '있다': 'For people ("is there"). For "has", use 있으세요.' };
// Words whose short negative uses a different word instead of 안.
const NEG_SWAP = { '있다': '없다', '알다': '모르다' };

const isVerbish = word => typeof word === 'string' && word.length >= 2 && word.endsWith('다') && !!dec([...word][word.length - 2]);

function guessIrr(word, type) {
  if (!isVerbish(word)) return '';
  const chars = [...word.slice(0, -1)], last = chars[chars.length - 1], d = dec(last);
  if (last === '르' && chars.length > 1) return '르';
  if (d.T === T_B) { if (type === 'desc') return ['좁', '넓'].includes(last) ? '' : 'ㅂ'; return ['돕', '눕', '줍', '굽'].includes(last) ? 'ㅂ' : ''; }
  if (d.T === 7) return ['듣', '걷', '묻', '싣', '깨닫'].includes(last) ? 'ㄷ' : '';
  if (d.T === 19) return ['낫', '짓', '붓', '잇', '젓'].includes(last) ? 'ㅅ' : '';
  if (d.T === T_H && type === 'desc' && last !== '좋') return 'ㅎ';
  return '';
}

function analyze(word, type, irrOverride) {
  if (!isVerbish(word)) return null;
  const stem = word.slice(0, -1), chars = [...stem], last = chars[chars.length - 1], d = dec(last);
  const head = chars.slice(0, -1).join('');
  let irr = (irrOverride === undefined || irrOverride === null || irrOverride === 'auto') ? guessIrr(word, type) : irrOverride;
  // ignore an irregular tag that can't apply to this stem
  if (irr === 'ㅂ' && d.T !== T_B) irr = '';
  if (irr === 'ㄷ' && d.T !== 7) irr = '';
  if (irr === 'ㅅ' && d.T !== 19) irr = '';
  if (irr === 'ㅎ' && d.T !== T_H) irr = '';
  if (irr === '르' && !(last === '르' && chars.length > 1)) irr = '';
  const a = { word, type, stem, chars, last, d, head, irr, isHa: last === '하', lStem: d.T === T_L && !irr };

  // Base used before 으-type endings (-(으)면, -(으)ㄴ, -(으)ㄹ, -(으)세요 ...)
  // mode: 'v' vowel-final, 'c' needs 으, 'l' regular ㄹ stem
  if (irr === 'ㅂ') { a.euBase = head + com(d.L, d.V, 0) + '우'; a.euMode = 'v'; }
  else if (irr === 'ㄷ') { a.euBase = head + com(d.L, d.V, T_L); a.euMode = 'c'; }
  else if (irr === 'ㅅ') { a.euBase = head + com(d.L, d.V, 0); a.euMode = 'c'; }
  else if (irr === 'ㅎ') { a.euBase = head + com(d.L, d.V, 0); a.euMode = 'v'; }
  else if (a.lStem) { a.euBase = stem; a.euMode = 'l'; }
  else if (d.T > 0) { a.euBase = stem; a.euMode = 'c'; }
  else { a.euBase = stem; a.euMode = 'v'; }

  a.inf = infinitive(a);
  a.pastBase = a.inf.slice(0, -1) + setT(a.inf[a.inf.length - 1], T_SS); // 갔, 먹었, 했
  return a;
}

// 아/어 form: 가, 먹어, 해, 추워, 들어, 몰라, 써, 마셔, 빨개
function infinitive(a) {
  const { stem, chars, last, d, head, irr } = a;
  if (a.isHa) return head + '해';
  if (irr === '르') { const p = dec(chars[chars.length - 2]); const pre = chars.slice(0, -2).join(''); return pre + com(p.L, p.V, T_L) + (BRIGHT.has(p.V) ? '라' : '러'); }
  if (irr === 'ㅂ') return head + com(d.L, d.V, 0) + (last === '돕' || last === '곱' ? '와' : '워');
  if (irr === 'ㄷ') return head + com(d.L, d.V, T_L) + (BRIGHT.has(d.V) ? '아' : '어');
  if (irr === 'ㅅ') return head + com(d.L, d.V, 0) + (BRIGHT.has(d.V) ? '아' : '어');
  if (irr === 'ㅎ') { const nv = { 0: 1, 4: 1, 2: 3, 6: 7 }[d.V]; return head + com(d.L, nv !== undefined ? nv : d.V, 0); }
  if (d.T > 0) return stem + (BRIGHT.has(d.V) ? '아' : '어');
  let nv = null;
  switch (d.V) {
    case 0: case 1: case 4: case 5: case 6: nv = d.V; break; // ㅏ ㅐ ㅓ ㅔ ㅕ: merge
    case 8: nv = 9; break;   // ㅗ → ㅘ
    case 13: nv = 14; break; // ㅜ → ㅝ
    case 20: nv = 6; break;  // ㅣ → ㅕ
    case 11: nv = 10; break; // ㅚ → ㅙ
    case 18: { // ㅡ drops
      if (chars.length === 1) nv = 4;
      else { const p = dec(chars[chars.length - 2]); nv = p && BRIGHT.has(p.V) ? 0 : 4; }
      break;
    }
  }
  return nv !== null ? head + com(d.L, nv, 0) : stem + (BRIGHT.has(d.V) ? '아' : '어');
}

// -(으)ㄴ  →  간, 먹은, 산, 추운, 들은, 빨간
function euN(a) {
  if (a.euMode === 'v') return a.euBase.slice(0, -1) + setT(a.euBase.slice(-1), T_N);
  if (a.euMode === 'l') return a.euBase.slice(0, -1) + setT(a.euBase.slice(-1), T_N);
  return a.euBase + '은';
}
// -(으)ㄹ  →  갈, 먹을, 살, 추울, 들을
function euL(a) {
  if (a.euMode === 'v') return a.euBase.slice(0, -1) + setT(a.euBase.slice(-1), T_L);
  if (a.euMode === 'l') return a.euBase;
  return a.euBase + '을';
}
// -(으)+syllables  →  가면, 먹으면, 살면, 사니까, 추우면
function euS(a, rest) {
  if (a.euMode === 'v') return a.euBase + rest;
  if (a.euMode === 'l') {
    const r = dec(rest[0]);
    // ㄹ drops before ㄴ (2), ㅅ (9), ㅂ (7) initials: 사니까, 사세요, 사십니다
    if (r && [2, 9, 7].includes(r.L)) return a.euBase.slice(0, -1) + setT(a.euBase.slice(-1), 0) + rest;
    return a.euBase + rest;
  }
  return a.euBase + '으' + rest;
}
// consonant-initial endings attach to the plain stem: 가고, 먹지만, 사는 (ㄹ drops before ㄴ/ㅅ/ㅂ)
function plain(a, rest) {
  if (a.lStem) {
    const r = dec(rest[0]);
    if (r && [2, 9, 7].includes(r.L)) return a.stem.slice(0, -1) + setT(a.last, 0) + rest;
  }
  return a.stem + rest;
}
// -(스)ㅂ니다 / -(스)ㅂ니까
function formal(a, rest) {
  if (a.lStem) return a.stem.slice(0, -1) + setT(a.last, T_B) + rest;
  if (a.d.T > 0) return a.stem + '습' + rest;
  return a.stem.slice(0, -1) + setT(a.last, T_B) + rest;
}
function honBase(a) {
  const h = HONORIFIC[a.word];
  if (h && a.type === 'verb') return h.slice(0, -1); // 드시, 주무시, 계시
  return euS(a, '시');                                // 가시, 먹으시, 사시, 추우시
}

// Basic three forms for cards and quick quizzes
function basic(word, type, irr) {
  const a = analyze(word, type, irr); if (!a) return null;
  return { pres: a.inf + '요', past: a.pastBase + '어요', fut: euL(a) + ' 거예요' };
}

function negParts(a) {
  // returns { kind: 'normal'|'swap'|'none', split } for short negation
  if (a.word === '없다' || a.word === '모르다' || /없다$/.test(a.word)) return { kind: 'none' };
  if (NEG_SWAP[a.word]) return { kind: 'swap', to: NEG_SWAP[a.word] };
  if (/있다$/.test(a.word) && a.word !== '있다') return { kind: 'swap', to: a.word.replace(/있다$/, '없다') };
  // 공부하다 → 공부 안 해요 (noun + 하다 action verbs split; 좋아하다 does not)
  if (a.isHa && a.type === 'verb' && a.chars.length >= 2) {
    const prev = a.chars[a.chars.length - 2];
    if (!['아', '어', '워', '와', '해'].includes(prev)) return { kind: 'normal', split: a.head };
  }
  return { kind: 'normal' };
}

// Full conjugation table: [{ title, rows: [{ id, label, pattern, form, note? }] }]
function table(word, type, irr, overrides) {
  const a = analyze(word, type, irr); if (!a) return [];
  const isVerb = type === 'verb';
  const ov = overrides || {};
  const pres = ov.pres || a.inf + '요', past = ov.past || a.pastBase + '어요', fut = ov.fut || euL(a) + ' 거예요';
  const sections = [];
  const sec = (title, rows) => { rows = rows.filter(Boolean); if (rows.length) sections.push({ title, rows }); };
  const r = (id, label, pattern, form, note) => ({ id, label, pattern, form, note });
  const hasIssNeun = /[있없]다$/.test(word);
  const exist = isVerb && (word === '있다' || word === '없다'); // existence: no "doing" forms
  const act = isVerb && !exist;

  sec('Polite · 해요체 (everyday)', [
    r('pres', 'Present', '-아/어요', pres),
    r('past', 'Past', '-았/었어요', past),
    r('fut', isVerb ? 'Future' : 'Future / guess', '-(으)ㄹ 거예요', fut),
    act && r('prog', 'Doing right now', '-고 있어요', plain(a, '고 있어요')),
    r('q', 'Question', '-아/어요?', pres + '?'),
  ]);
  sec('Formal · 합니다체 (news, presentations)', [
    r('f_pres', 'Present', '-(스)ㅂ니다', formal(a, '니다')),
    r('f_past', 'Past', '-았/었습니다', a.pastBase + '습니다'),
    r('f_fut', isVerb ? 'Future' : 'Future / guess', '-(으)ㄹ 겁니다', euL(a) + ' 겁니다'),
    r('f_q', 'Question', '-(스)ㅂ니까?', formal(a, '니까') + '?'),
  ]);
  sec('Casual · 반말 (friends, younger people)', [
    r('c_pres', 'Present', '-아/어', a.inf),
    r('c_past', 'Past', '-았/었어', a.pastBase + '어'),
    r('c_fut', isVerb ? 'Future' : 'Future / guess', '-(으)ㄹ 거야', euL(a) + ' 거야'),
    act && r('c_lets', "Let's", '-자', plain(a, '자')),
  ]);
  const hb = honBase(a), hbs = hb.slice(0, -1);
  const honNote = isVerb && HONORIFIC[word] ? (HON_NOTE[word] || `Uses the honorific verb ${HONORIFIC[word]}.`) : undefined;
  sec('Honorific · -(으)시- (talking about elders, teachers)', [
    r('h_pres', 'Present', '-(으)세요', hbs + '세요', honNote),
    r('h_past', 'Past', '-(으)셨어요', hbs + '셨어요'),
    r('h_fut', isVerb ? 'Future' : 'Future / guess', '-(으)실 거예요', hbs + '실 거예요'),
  ]);

  const neg = negParts(a);
  const negRows = [];
  if (neg.kind === 'normal') {
    const pre = neg.split ? neg.split + ' ' : '';
    const tail = s => neg.split ? s.slice(neg.split.length) : s;
    negRows.push(r('n_pres', 'Not (present)', '안 + verb', pre + '안 ' + tail(pres)));
    negRows.push(r('n_past', 'Not (past)', '안 + verb', pre + '안 ' + tail(past)));
    if (isVerb) negRows.push(r('n_mot', "Can't", '못 + verb', pre + '못 ' + tail(pres)));
  } else if (neg.kind === 'swap') {
    const b = basic(neg.to, type);
    negRows.push(r('n_pres', 'Not (present)', neg.to, b.pres, `Korean uses ${neg.to} instead of 안 ${pres}.`));
    negRows.push(r('n_past', 'Not (past)', neg.to, b.past));
  }
  if (neg.kind !== 'none') {
    negRows.push(r('n_long', 'Not (formal-ish)', '-지 않아요', plain(a, '지 않아요')));
    negRows.push(r('n_long_past', 'Not (past, formal-ish)', '-지 않았어요', plain(a, '지 않았어요')));
  }
  sec('Negative', negRows.length ? negRows : [r('n_none', 'Already negative', '', word, 'This word is already a negative.')]);

  if (isVerb) {
    sec('Requests & suggestions', [
      r('please', 'Please (do)', '-(으)세요', hbs + '세요'),
      r('please_me', 'Please (do it for me)', '-아/어 주세요', a.inf + ' 주세요'),
      r('dont', "Please don't", '-지 마세요', plain(a, '지 마세요')),
      r('shall', 'Shall we? / Shall I?', '-(으)ㄹ까요?', euL(a) + '까요?'),
      r('will', "I'll (promise)", '-(으)ㄹ게요', euL(a) + '게요'),
    ]);
  }
  sec('Useful expressions', [
    act && r('want', 'Want to', '-고 싶어요', plain(a, '고 싶어요')),
    isVerb && r('can', 'Can', '-(으)ㄹ 수 있어요', euL(a) + ' 수 있어요'),
    isVerb && r('cant', "Can't", '-(으)ㄹ 수 없어요', euL(a) + ' 수 없어요'),
    isVerb && r('must', 'Have to', '-아/어야 해요', a.inf + '야 해요'),
    act && r('try', 'Try (doing)', '-아/어 보세요', a.inf + ' 보세요'),
    !isVerb && r('become', 'Become / get', '-아/어져요', a.inf + '져요'),
    r('wow', 'Wow, (it) …!', '-네요', plain(a, '네요')),
    r('right', '…, right?', '-죠?', plain(a, '죠') + '?'),
  ]);
  sec('Connecting sentences', [
    r('and', 'And', '-고', plain(a, '고')),
    r('so', isVerb ? 'So / and then' : 'So', '-아/어서', a.inf + '서'),
    r('but', 'But', '-지만', plain(a, '지만')),
    r('if', 'If / when', '-(으)면', euS(a, '면')),
    r('because', 'Because', '-(으)니까', euS(a, '니까')),
    r('bg', 'And so / but (background)', isVerb || hasIssNeun ? '-는데' : '-(으)ㄴ데', (isVerb || hasIssNeun) ? plain(a, '는데') : euN(a) + '데'),
    act && r('purpose', 'To go/come (in order) to', '-(으)러', euS(a, '러'), 'Used with 가다 / 오다: ' + euS(a, '러') + ' 가요'),
    act && r('intend', 'Intending to', '-(으)려고', euS(a, '려고')),
  ]);
  if (isVerb) {
    sec('Describing a noun (verb + noun)', [
      exist ? r('m_past', 'Past: … that was/had', '-았/었던', a.pastBase + '던') : r('m_past', 'Past: … that I did', '-(으)ㄴ', euN(a)),
      r('m_pres', 'Present: … that I do', '-는', plain(a, '는')),
      r('m_fut', 'Future: … that I will do', '-(으)ㄹ', euL(a)),
    ]);
  } else {
    sec('Describing a noun (adjective + noun)', [
      r('m_pres', 'Present: a … thing', hasIssNeun ? '-는' : '-(으)ㄴ', hasIssNeun ? plain(a, '는') : euN(a)),
      r('m_past', 'Past: a thing that was …', '-았/었던', a.pastBase + '던'),
      r('adv', 'As an adverb (…-ly)', '-게', plain(a, '게')),
    ]);
  }
  return sections;
}

const api = { analyze, basic, table, guessIrr, isVerbish, IRREGULARS, dec };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Conj = api;
})(typeof window !== 'undefined' ? window : globalThis);
