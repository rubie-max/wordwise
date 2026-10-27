'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const FLAME = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.5-1.5 5-1.5 8 0 1.5 1 2.5 2 2.5 1.6 0 2.5-1.3 2.5-3 2 1.6 3 4 3 6 0 3.9-2.9 6.5-6.5 6.5S5 19.4 5 15.5C5 10 10 8 12 2z"/></svg>';

/* Simple personal lock — not real security. */
const ACCESS_USER = 'Kaizen';
const ACCESS_PASS = 'Kaizen@2026';
const AUTH_KEY = 'wordwise-auth';

function unlockApp() {
  document.body.classList.remove('locked');
  $('#gate').hidden = true;
}

function lockApp() {
  document.body.classList.add('locked');
  $('#gate').hidden = false;
  $('#gate-pass').value = '';
  $('#gate-user').focus();
}

$('#gate-form').addEventListener('submit', e => {
  e.preventDefault();
  const user = $('#gate-user').value.trim();
  const pass = $('#gate-pass').value;
  if (user === ACCESS_USER && pass === ACCESS_PASS) {
    store.set(AUTH_KEY, ACCESS_USER);
    $('#gate-error').textContent = '';
    unlockApp();
  } else {
    $('#gate-error').textContent = 'Wrong username or password.';
  }
});

$('#sign-out').addEventListener('click', () => {
  localStorage.removeItem(AUTH_KEY);
  closePopovers();
  lockApp();
});

$('#gate-reveal').addEventListener('click', () => {
  const input = $('#gate-pass');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('#gate-reveal').textContent = show ? 'Hide' : 'Show';
  $('#gate-reveal').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  $('meta[name="theme-color"]').content = next === 'dark' ? '#0a0c18' : '#f4f3fb';
  store.set('wordwise-theme', next);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (store.get(AUTH_KEY, '') === ACCESS_USER) unlockApp();

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2800);
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Popovers ---------- */

function closePopovers() {
  $$('.popover').forEach(p => (p.hidden = true));
  $$('[aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function bindPopover(toggleSel, panelSel) {
  const toggle = $(toggleSel);
  const panel = $(panelSel);
  toggle.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.hidden || panel.parentElement !== toggle.parentElement;
    closePopovers();
    toggle.parentElement.append(panel);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('click', e => e.stopPropagation());
}

bindPopover('#voice-toggle', '#voice-panel');
bindPopover('#session-voice', '#voice-panel');
bindPopover('#account-toggle', '#account-panel');
document.addEventListener('click', closePopovers);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closePopovers();
  closeSheet();
});

/* ---------- Tabs ---------- */

function showTab(name) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => (p.hidden = p.id !== name));
  if (name === 'progress') renderProgress();
  window.scrollTo({ top: 0 });
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- Speech ---------- */

const canSpeak = 'speechSynthesis' in window;
let voices = [];

// macOS ships joke voices that should never be picked automatically.
const NOVELTY_VOICES = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|fred|good news|jester|junior|organ|ralph|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const NATURAL_SCORE = 50;

function voiceScore(v) {
  const name = v.name;
  let score = 0;
  if (/natural/i.test(name)) score += 100;
  if (/premium/i.test(name)) score += 90;
  if (/enhanced/i.test(name)) score += 70;
  if (/online/i.test(name)) score += 60;
  if (/google/i.test(name)) score += 50;
  if (!v.localService) score += 10;
  if (/^en[-_](us|gb)$/i.test(v.lang)) score += 5;
  if (NOVELTY_VOICES.test(name)) score -= 200;
  return score;
}

function loadVoices() {
  voices = speechSynthesis.getVoices()
    .filter(v => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
  const saved = store.get('voice', '');
  $('#voice').innerHTML = voices.length
    ? voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})${voiceScore(v) >= NATURAL_SCORE ? ' - natural' : ''}</option>`).join('')
    : '<option value="">Default voice</option>';
  if (voices.some(v => v.name === saved)) $('#voice').value = saved;
  $('#voice-tip').hidden = !voices.length || voiceScore(voices[0]) >= NATURAL_SCORE;
}

if (canSpeak) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
} else {
  $('#speech-warning').hidden = false;
}

function showRate(rate) { $('#rate-value').textContent = `${rate.toFixed(1)}x`; }
$('#rate').value = store.get('rate', 0.9);
showRate(+$('#rate').value);
$('#rate').addEventListener('input', e => { store.set('rate', +e.target.value); showRate(+e.target.value); });
$('#voice').addEventListener('change', e => store.set('voice', e.target.value));

let speakId = 0;

function setSpeaking(on) {
  $('#session').classList.toggle('speaking', on);
  $('#play-cap').textContent = on ? 'Playing\u2026 tap to hear it again' : 'Tap to hear the word again';
}

function speak(text, rate = +$('#rate').value) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const id = ++speakId;
  const u = new SpeechSynthesisUtterance(text);
  const voice = voices.find(v => v.name === $('#voice').value);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-US';
  u.rate = rate;
  u.onstart = () => setSpeaking(true);
  u.onend = u.onerror = () => { if (id === speakId) setSpeaking(false); };
  speechSynthesis.speak(u);
}

const spellOut = word => speak(word.toUpperCase().split('').join(', '), 0.7);

$('#voice-test').addEventListener('click', () => speak('Necessary. This is how your dictation will sound.'));

/* ---------- Dictionary data ---------- */

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const cache = new Map();

async function lookup(word) {
  const key = word.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const url = API + encodeURIComponent(key);
  const res = await fetch(url).catch(() => new Promise(r => setTimeout(r, 700)).then(() => fetch(url)));
  if (res.status === 404) {
    cache.set(key, null);
    return null;
  }
  if (!res.ok) throw new Error(`The dictionary service returned an error (${res.status}).`);
  const data = await res.json();
  cache.set(key, data);
  return data;
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function accentOf(url) {
  const m = url.match(/-(uk|us|au|ca|in)\.mp3$/i);
  return m ? m[1].toUpperCase() : 'Audio';
}

// Senses like "(archaic) ..." or "(usually with the definite article) ..." are rarely the one a learner needs.
const isLabelled = d => /^\(/.test(d.definition.trim());

function groupMeanings(entries) {
  const groups = new Map();
  for (const m of entries.flatMap(e => e.meanings || [])) {
    const g = groups.get(m.partOfSpeech) || { defs: [], syn: new Set(), ant: new Set() };
    g.defs.push(...m.definitions);
    (m.synonyms || []).forEach(s => g.syn.add(s));
    (m.antonyms || []).forEach(a => g.ant.add(a));
    m.definitions.forEach(d => {
      (d.synonyms || []).forEach(s => g.syn.add(s));
      (d.antonyms || []).forEach(a => g.ant.add(a));
    });
    groups.set(m.partOfSpeech, g);
  }
  return groups;
}

const chips = words => words.slice(0, 20)
  .map(w => `<button class="chip link" data-lookup="${esc(w)}">${esc(w)}</button>`).join('');

function wordCard(word, entries) {
  if (!entries) {
    return `<article class="card">
      <h2>${esc(word)}</h2>
      <p class="muted">No dictionary entry found. Check the spelling, or try another form of the word.</p>
    </article>`;
  }

  const headword = entries[0].word;

  const seen = new Set();
  const phonetics = entries.flatMap(e => e.phonetics || []).filter(p => {
    const key = `${p.text || ''}|${p.audio || ''}`;
    if ((!p.text && !p.audio) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const phoneticHtml = phonetics.map(p => `<span class="phonetic">
      ${p.text ? esc(p.text) : ''}
      ${p.audio ? `<button class="chip" data-audio="${esc(p.audio)}" title="Play recorded pronunciation">Play ${accentOf(p.audio)}</button>` : ''}
    </span>`).join('');

  const meaningsHtml = [...groupMeanings(entries)].map(([pos, g]) => `
    <section class="meaning">
      <h3>${esc(pos)}</h3>
      <ol>${g.defs.map(d => `<li>${esc(d.definition)}${d.example ? `<p class="example">"${esc(d.example)}"</p>` : ''}</li>`).join('')}</ol>
      ${g.syn.size ? `<p class="related"><span>Synonyms</span>${chips([...g.syn])}</p>` : ''}
      ${g.ant.size ? `<p class="related"><span>Antonyms</span>${chips([...g.ant])}</p>` : ''}
    </section>`).join('');

  const origin = entries.find(e => e.origin)?.origin;
  const sources = [...new Set(entries.flatMap(e => e.sourceUrls || []))];
  const letters = headword.split('');
  const letterCount = letters.filter(l => /[a-z]/i.test(l)).length;
  const syl = syllables(headword);

  return `<article class="card word-card">
    <header class="word-head">
      <div>
        <h2>${esc(headword)}</h2>
        <div class="phonetics">${phoneticHtml}</div>
      </div>
      <div class="row">
        <button class="btn" data-speak="${esc(headword)}">Speak</button>
        <button class="btn ghost" data-spell="${esc(headword)}">Spell out</button>
      </div>
    </header>
    <section class="spelling">
      <h3>Spelling</h3>
      <div class="letters">${letters.map(l => `<span>${esc(l)}</span>`).join('')}</div>
      <p class="muted small">${letterCount} letters, about ${syl} syllable${syl === 1 ? '' : 's'}</p>
    </section>
    ${meaningsHtml}
    ${origin ? `<section><h3>Origin</h3><p>${esc(origin)}</p></section>` : ''}
    ${sources.length ? `<p class="source">Source: ${sources.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join(', ')}</p>` : ''}
  </article>`;
}

const errorCard = err => `<div class="card error">Couldn't load the dictionary entry. ${esc(err.message)}</div>`;

document.addEventListener('click', e => {
  const t = e.target.closest('[data-audio],[data-speak],[data-spell],[data-lookup]');
  if (!t) return;
  if (t.dataset.audio) new Audio(t.dataset.audio).play().catch(() => toast('Could not play that recording.'));
  else if (t.dataset.speak) speak(t.dataset.speak);
  else if (t.dataset.spell) spellOut(t.dataset.spell);
  else if (t.dataset.lookup) {
    showTab('dictionary');
    search(t.dataset.lookup);
  }
});

/* ---------- Dictionary tab ---------- */

function renderRecent() {
  const recent = store.get('recent', []);
  $('#recent').innerHTML = recent.length ? `<span class="muted small">Recent</span>${chips(recent)}` : '';
}

function addRecent(word) {
  const recent = [word, ...store.get('recent', []).filter(w => w !== word)].slice(0, 12);
  store.set('recent', recent);
  renderRecent();
}

async function search(word) {
  word = word.trim();
  if (!word) return;
  $('#dict-input').value = word;
  const out = $('#dict-result');
  out.innerHTML = '<p class="muted">Looking up...</p>';
  try {
    const entries = await lookup(word);
    out.innerHTML = wordCard(word, entries);
    if (entries) addRecent(word.toLowerCase());
  } catch (err) {
    out.innerHTML = errorCard(err);
  }
}

$('#dict-form').addEventListener('submit', e => {
  e.preventDefault();
  search($('#dict-input').value);
});

/* ---------- Days, streak and goal ---------- */

const pad = n => String(n).padStart(2, '0');
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function streakInfo() {
  const totals = new Map();
  for (const h of store.get('history', [])) {
    const k = dayKey(h.date);
    totals.set(k, (totals.get(k) || 0) + h.total);
  }

  const today = new Date();
  let current = 0;
  let d = totals.has(dayKey(today)) ? today : addDays(today, -1);
  while (totals.has(dayKey(d))) {
    current++;
    d = addDays(d, -1);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of [...totals.keys()].sort()) {
    run = prev && dayKey(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = new Date(`${k}T00:00:00`);
  }
  return { current, best, totals };
}

function renderGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = `${part}, ${ACCESS_USER}`;
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderStreak() {
  const { current, best, totals } = streakInfo();
  $('#streak-days').textContent = current;
  $('#streak-unit').textContent = current === 1 ? 'day' : 'days';

  const today = new Date();
  $('#week').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const done = totals.has(dayKey(d));
    const isToday = i === 6;
    const label = isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="day${done ? ' done' : ''}${isToday ? ' today' : ''}" title="${esc(d.toDateString())}${done ? ', practised' : ''}">
      <i>${done ? FLAME : ''}</i><span>${esc(label)}</span>
    </div>`;
  }).join('');

  $('#streak-best').textContent = best
    ? `Best streak: ${plural(best, 'day')}. A day counts once you finish a dictation.`
    : 'Finish a dictation today to start your streak.';

  const goal = store.get('dailyGoal', 10);
  const done = totals.get(dayKey(today)) || 0;
  $('#goal-ring').style.setProperty('--pct', Math.min(100, (done / goal) * 100));
  $('#goal-done').textContent = done;
  $('#goal-of').textContent = `of ${goal}`;
  $('#goal-text').textContent = done >= goal
    ? 'Goal reached for today. Extra practice still counts.'
    : `${plural(goal - done, 'more word')} to reach today's goal.`;
}

/* ---------- Practice home ---------- */

const LIST_BLURBS = {
  easy: 'Everyday words',
  medium: 'School words and silent letters',
  hard: 'Tricky exam words',
  misspelled: 'The classic spelling traps',
  mistakes: 'Words you got wrong before',
  custom: 'Typed, pasted or imported',
};
const LIST_KEYS = [...Object.keys(WORD_LISTS), 'mistakes', 'custom'];

let selectedList = store.get('selectedList', 'misspelled');
if (!LIST_KEYS.includes(selectedList)) selectedList = 'easy';
let selectedCount = store.get('count', 10);

const session = { words: [], index: 0, results: [], checked: false, label: '', started: 0, typed: '' };
const current = () => session.words[session.index];
const parseCustom = text => [...new Set(text.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean))];

function listLabel(key) {
  if (key === 'mistakes') return 'My mistakes';
  if (key === 'custom') return 'My own words';
  return WORD_LISTS[key].label;
}

function listWords(key) {
  if (key === 'custom') return parseCustom($('#custom-words').value);
  if (key === 'mistakes') return store.get('mistakes', []);
  return WORD_LISTS[key].words.slice();
}

function renderHero() {
  const n = listWords(selectedList).length;
  const take = selectedCount ? Math.min(selectedCount, n) : n;
  $('#hero-title').textContent = listLabel(selectedList);
  if (n) {
    $('#hero-sub').textContent = `${plural(take, 'word')}${$('#shuffle').checked ? ', shuffled' : ''}. Hear each word, type it, then study it.`;
  } else {
    $('#hero-sub').textContent = selectedList === 'mistakes'
      ? 'No saved mistakes yet. Pick another list.'
      : 'Add some words below to start.';
  }
}

function renderLists() {
  $('#list-grid').innerHTML = LIST_KEYS.map(key => {
    const n = listWords(key).length;
    const on = key === selectedList;
    return `<button type="button" class="list-card${on ? ' active' : ''}" data-list="${key}" role="radio" aria-checked="${on}">
      <span class="list-name">${esc(listLabel(key))}</span>
      <span class="list-blurb">${esc(LIST_BLURBS[key])}</span>
      <span class="list-count">${plural(n, 'word')}</span>
    </button>`;
  }).join('');
  $('#custom-wrap').hidden = selectedList !== 'custom';
  const customN = parseCustom($('#custom-words').value).length;
  $('#custom-count').textContent = customN ? `${plural(customN, 'word')} ready.` : '';
  renderHero();
}

function renderCount() {
  $$('#count-pills [data-count]').forEach(b => {
    const on = +b.dataset.count === selectedCount;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderHero();
}

function renderHome() {
  renderGreeting();
  renderLists();
  renderCount();
  renderStreak();
}

$('#list-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-list]');
  if (!b) return;
  selectedList = b.dataset.list;
  store.set('selectedList', selectedList);
  $('#setup-error').textContent = '';
  renderLists();
  if (selectedList === 'custom') $('#custom-words').focus();
});

$('#count-pills').addEventListener('click', e => {
  const b = e.target.closest('[data-count]');
  if (!b) return;
  selectedCount = +b.dataset.count;
  store.set('count', selectedCount);
  renderCount();
});

$('#shuffle').checked = store.get('shuffle', true);
$('#shuffle').addEventListener('change', () => {
  store.set('shuffle', $('#shuffle').checked);
  renderHero();
});

$('#custom-words').value = store.get('customWords', '');
$('#custom-words').addEventListener('input', () => {
  store.set('customWords', $('#custom-words').value);
  renderLists();
});

$('#import-file').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '').replace(/^\uFEFF/, '');
    const existing = $('#custom-words').value.trim();
    $('#custom-words').value = existing ? `${existing}\n${text}` : text;
    store.set('customWords', $('#custom-words').value);
    renderLists();
    toast(`Imported ${file.name}`);
    e.target.value = '';
  };
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsText(file);
});

/* ---------- Dictation session ---------- */

const finePointer = matchMedia('(pointer: fine)').matches;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four'];
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', "'zxcvbnm-"];
const MAX_TYPED = 40;
const BACKSPACE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="m17 9-6 6M11 9l6 6"/></svg>';

const tile = (letter, cls = '') => `<b${cls ? ` class="${cls}"` : ''}>${letter === ' ' ? '&nbsp;' : esc(letter)}</b>`;

$('#kb-keys').innerHTML = KEY_ROWS.map(row => `<div class="kb-row">${[...row].map(k => {
  const mark = !/[a-z]/.test(k);
  return `<button class="k${mark ? ' mark' : ''}" type="button" data-key="${esc(k)}" aria-label="${k === "'" ? 'Apostrophe' : k === '-' ? 'Hyphen' : k}">${esc(k)}</button>`;
}).join('')}</div>`).join('') + `<div class="kb-row">
    <button class="k back" type="button" data-key="Backspace" aria-label="Delete letter">${BACKSPACE_ICON}</button>
    <button id="check" class="k go" type="button">Check</button>
  </div>`;

function openPlay(id) {
  $('#session').hidden = id !== 'session';
  $('#summary').hidden = id !== 'summary';
  document.body.classList.toggle('in-play', Boolean(id));
  closePopovers();
}

const setState = state => { $('#session').dataset.state = state; };

function startSession(words, label) {
  Object.assign(session, { words, index: 0, results: [], label, started: Date.now() });
  $('#session-list').textContent = label;
  openPlay('session');
  showWord();
}

$('#setup').addEventListener('submit', e => {
  e.preventDefault();
  let words = listWords(selectedList);
  if (!words.length) {
    $('#setup-error').textContent = selectedList === 'mistakes' ? 'You have no saved mistakes yet.' : 'Add at least one word first.';
    return;
  }
  $('#setup-error').textContent = '';
  if ($('#shuffle').checked) words = shuffle(words);
  if (selectedCount) words = words.slice(0, selectedCount);
  startSession(words, listLabel(selectedList));
});

function renderSegs() {
  const segs = $('#segs');
  segs.style.setProperty('--n', session.words.length);
  segs.classList.toggle('dense', session.words.length > 24);
  segs.innerHTML = session.words.map((_, i) => {
    const r = session.results[i];
    const cls = r ? (r.correct ? 'ok' : 'bad') : i === session.index ? 'now' : '';
    return `<i class="${cls}"></i>`;
  }).join('');
}

function renderTyped() {
  const letters = [...session.typed];
  $('#typed').classList.toggle('long', letters.length > 9);
  $('#typed').innerHTML = letters.map(l => tile(l)).join('') + '<b class="caret"></b>';
  if (!session.checked) setState(letters.length ? 'typing' : 'listen');
}

function typeKey(key) {
  if (session.checked) return;
  if (key === 'Backspace') session.typed = session.typed.slice(0, -1);
  else if (session.typed.length < MAX_TYPED) session.typed += key;
  renderTyped();
}

function checkAnswer() {
  if (session.checked) return;
  const typed = session.typed.trim();
  if (!typed) {
    toast('Type the word with the letter keys first.');
    return;
  }
  record(current(), typed);
}

function showWord() {
  session.checked = false;
  const word = current();
  $('#progress-text').textContent = `Word ${session.index + 1} of ${session.words.length}`;
  renderSegs();
  session.typed = '';
  renderTyped();
  setTimeout(() => { if (current() === word && !session.checked) speak(word); }, 300);
  lookup(word).catch(() => {});
}

$('#kb-keys').addEventListener('click', e => {
  const key = e.target.closest('[data-key]');
  if (key) typeKey(key.dataset.key);
});
$('#check').addEventListener('click', checkAnswer);

// A physical keyboard (computer or tablet) types into the same tiles.
document.addEventListener('keydown', e => {
  if ($('#session').hidden || !$('#sheet-wrap').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, select, textarea')) return;
  const asking = !session.checked;
  if (asking && /^[a-z'-]$/i.test(e.key)) typeKey(e.key.toLowerCase());
  else if (asking && e.key === 'Backspace') typeKey('Backspace');
  else if (e.key === 'Enter' && !e.target.closest('button')) {
    if (asking) checkAnswer();
    else next();
  } else return;
  e.preventDefault();
});

async function examplesFor(word) {
  const entries = await lookup(word);
  return (entries || []).flatMap(e => e.meanings || []).flatMap(m => m.definitions);
}

async function speakSentence() {
  const word = current();
  try {
    const examples = (await examplesFor(word)).map(d => d.example).filter(Boolean);
    const sentence = examples.find(x => x.toLowerCase().includes(word.toLowerCase())) || examples[0];
    if (sentence) speak(`${word}. ${sentence}. ${word}.`);
    else {
      speak(word);
      toast('No example sentence is available for this word.');
    }
  } catch {
    speak(word);
  }
}

async function speakMeaning() {
  const word = current();
  try {
    const defs = await examplesFor(word);
    if (defs.length) speak(`It means: ${defs[0].definition}`);
    else toast('No meaning is available for this word.');
  } catch {
    toast('Could not load the meaning.');
  }
}

$('#play').addEventListener('click', () => speak(current()));
$('#play-mini').addEventListener('click', () => speak(current()));
$('#play-slow').addEventListener('click', () => speak(current(), 0.55));
$('#play-sentence').addEventListener('click', speakSentence);
$('#play-meaning').addEventListener('click', speakMeaning);

// Letter-by-letter alignment of what was typed against the right spelling.
function alignLetters(typed, correct) {
  const a = typed.toLowerCase();
  const b = correct.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const ops = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ t: 'extra', a: typed[i - 1] });
      i--;
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      ops.push({ t: 'miss', b: correct[j - 1] });
      j--;
    } else {
      ops.push({ t: a[i - 1] === b[j - 1] ? 'same' : 'swap', a: typed[i - 1], b: correct[j - 1] });
      i--;
      j--;
    }
  }
  return ops.reverse();
}

function letterReminder(errs, word) {
  const w = word.toLowerCase();
  const longest = l => {
    let best = 0;
    let n = 0;
    for (const c of w) {
      n = c === l ? n + 1 : 0;
      best = Math.max(best, n);
    }
    return best;
  };
  const count = l => [...w].filter(c => c === l).length;
  const involved = new Set(errs.flatMap(o => [o.a, o.b]).filter(Boolean)
    .map(c => c.toLowerCase()).filter(c => /[a-z]/.test(c) && w.includes(c)));
  const doubled = new Set([...w].filter(c => /[a-z]/.test(c) && longest(c) > 1));
  if (!involved.size || !doubled.size) return '';
  const letters = [...new Set(w)].filter(c => doubled.has(c) || (involved.has(c) && count(c) === 1));
  if (!letters.some(c => involved.has(c))) return '';
  return ` Remember: ${letters.map(c => `${NUMBER_WORDS[longest(c)] || longest(c)} <b>${esc(c)}</b>`).join(', ')}.`;
}

function spellingTip(ops, word) {
  const errs = ops.filter(o => o.t !== 'same');
  if (!errs.length) return '';
  const k = ops.indexOf(errs[0]);
  const x = ops[k];
  const y = ops[k + 1];
  let tip;
  if (errs.length === 2 && y === errs[1] && x.t === 'swap' && y.t === 'swap'
      && x.a.toLowerCase() === y.b.toLowerCase() && x.b.toLowerCase() === y.a.toLowerCase()) {
    tip = `You swapped <b>${esc(x.b)}</b> and <b>${esc(y.b)}</b>.`;
  } else if (errs.length === 1) {
    tip = x.t === 'extra' ? `You added an extra <b>${esc(x.a)}</b>.`
      : x.t === 'miss' ? `You missed one <b>${esc(x.b)}</b>.`
      : `You wrote <b>${esc(x.a)}</b> instead of <b>${esc(x.b)}</b>.`;
  } else {
    tip = `${errs.length} letters were different. The green tiles show the right spelling.`;
  }
  return tip + letterReminder(errs, word);
}

const markTyped = (typed, word) => alignLetters(typed, word)
  .filter(o => o.t !== 'miss')
  .map(o => (o.t === 'same' ? esc(o.a) : `<s>${esc(o.a)}</s>`)).join('');

function updateMistakes(word, correct) {
  const mistakes = new Set(store.get('mistakes', []));
  if (correct) mistakes.delete(word);
  else mistakes.add(word);
  store.set('mistakes', [...mistakes]);
}

function entryFacts(entries) {
  const all = entries || [];
  const phonetic = all.flatMap(e => [e.phonetic, ...(e.phonetics || []).map(p => p.text)]).find(Boolean) || '';
  const defs = all.flatMap(e => e.meanings || []).flatMap(m => m.definitions || []);
  const main = defs.find(d => !isLabelled(d)) || defs[0];
  const example = [main, ...defs].map(d => d?.example).find(x => x && x.length <= 120) || '';
  return { phonetic, def: main?.definition || '', example };
}

const inARow = () => {
  let n = 0;
  for (let i = session.results.length - 1; i >= 0 && session.results[i].correct; i--) n++;
  return n;
};

function showCorrect(word) {
  setState('ok');
  $('#ok-word').textContent = word;
  $('#ok-phon').innerHTML = `<button class="chip" type="button" data-speak="${esc(word)}">Play</button>
    <button class="chip" type="button">Meaning</button>`;
  $('#ok-def').textContent = 'Loading meaning\u2026';
  const run = inARow();
  $('#in-a-row').hidden = run < 2;
  $('#in-a-row span').textContent = `${run} in a row`;
  $('.res-ok .res-body').scrollTop = 0;
  if (finePointer) $('#ok-next').focus();
}

function showWrong(word, typed) {
  setState('bad');
  $('#bad-title').textContent = typed ? 'Not quite' : 'Skipped';
  $('#bad-word').textContent = word;
  $('#bad-typed-wrap').hidden = !typed;
  const ops = typed ? alignLetters(typed, word) : [];
  const typedRow = ops.map(o => (o.t === 'same' ? tile(o.a, 'dim') : o.t === 'miss' ? tile('', 'gap') : tile(o.a, 'wrong')));
  const correctRow = typed
    ? ops.filter(o => o.t !== 'extra').map(o => tile(o.b, o.t === 'same' ? 'good' : 'good add'))
    : [...word].map(l => tile(l, 'good'));
  $('#bad-typed').innerHTML = typedRow.join('');
  $('#bad-typed').classList.toggle('long', typedRow.length > 11);
  $('#bad-correct').innerHTML = correctRow.join('');
  $('#bad-correct').classList.toggle('long', correctRow.length > 11);
  const tip = typed ? spellingTip(ops, word) : '';
  $('#bad-tip').hidden = !tip;
  $('#bad-tip span').innerHTML = tip;
  $('#bad-meaning').hidden = true;
  $('.res-bad .res-body').scrollTop = 0;
  if (finePointer) $('#bad-next').focus();
}

function fillResult(word, entries, correct) {
  const { phonetic, def, example } = entryFacts(entries);
  if (correct) {
    if (phonetic) $('#ok-phon').insertAdjacentHTML('afterbegin', `<span>${esc(phonetic)}</span>`);
    $('#ok-def').textContent = def || 'Tap Meaning for the full dictionary entry.';
  } else {
    $('#bad-meaning').hidden = !def;
    $('#bad-def').textContent = def;
    $('#bad-ex').textContent = example ? `"${example}"` : '';
    $('#bad-ex').hidden = !example;
  }
}

async function record(word, typed) {
  const correct = typed.toLowerCase() === word.toLowerCase();
  const index = session.index;
  session.results.push({ word, typed, correct });
  session.checked = true;
  updateMistakes(word, correct);

  renderSegs();
  const last = index + 1 >= session.words.length;
  $$('.next-btn').forEach(b => (b.textContent = last ? 'See results' : 'Next word'));
  if (correct) showCorrect(word);
  else showWrong(word, typed);

  try {
    const entries = await lookup(word);
    if (session.index === index && session.checked) fillResult(word, entries, correct);
  } catch {
    if (session.index === index && session.checked && correct) {
      $('#ok-def').textContent = "Couldn't load the meaning. Tap Meaning to try again.";
    }
  }
}

function next() {
  if (!session.checked) return;
  session.index++;
  if (session.index < session.words.length) showWord();
  else finish();
}

$('#skip').addEventListener('click', () => { if (!session.checked) record(current(), ''); });
$('#ok-next').addEventListener('click', next);
$('#bad-next').addEventListener('click', next);
$('#bad-hear').addEventListener('click', () => speak(current()));
$('#bad-entry').addEventListener('click', () => openSheet(current()));
$('#ok-card').addEventListener('click', e => {
  if (!e.target.closest('[data-speak]')) openSheet(current());
});

$('#quit').addEventListener('click', () => {
  if (session.results.length) finish();
  else showSetup();
});

function showSetup() {
  if (canSpeak) speechSynthesis.cancel();
  closeSheet();
  renderHome();
  openPlay(null);
  showTab('dictation');
}

function summaryRow(cls, word, note) {
  return `<button class="wl-row ${cls}" type="button" data-sheet-word="${esc(word)}">
    <i>${cls === 'k' ? '&#10003;' : '&times;'}</i>${esc(word)}<em>${note}</em>
  </button>`;
}

function finish() {
  if (canSpeak) speechSynthesis.cancel();
  closeSheet();
  const { results } = session;
  const score = results.filter(r => r.correct).length;
  const missed = results.length - score;
  const today = dayKey(new Date());
  const hadToday = streakInfo().totals.has(today);
  const history = store.get('history', []);
  history.unshift({ date: new Date().toISOString(), list: session.label, score, total: results.length });
  store.set('history', history.slice(0, 500));

  const { current: streak, totals } = streakInfo();
  const goal = store.get('dailyGoal', 10);
  const done = totals.get(today) || 0;
  const pct = Math.round((score / results.length) * 100);
  const secs = Math.round((Date.now() - session.started) / 1000);

  $('#summary-list-name').textContent = session.label;
  $('#summary-ring').style.setProperty('--pct', pct);
  $('#summary-pct').textContent = `${pct}%`;
  $('#summary-message').textContent = `${pct === 100 ? 'Perfect' : pct >= 70 ? 'Great work' : 'Keep going'}, ${ACCESS_USER}`;
  $('#summary-sub').textContent = `${score} of ${results.length} spelled right`;
  $('#summary-correct').textContent = score;
  $('#summary-missed').textContent = missed;
  $('#summary-time').textContent = `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
  $('#summary-streak').textContent = `${streak}-day streak`;
  $('#summary-streak-sub').textContent = hadToday ? 'Today already counted' : '+1 today';
  $('#summary-goal').textContent = done >= goal ? 'Goal reached' : 'Daily goal';
  $('#summary-goal-sub').textContent = `${done} of ${goal} today`;
  $('#summary-goal-icon').classList.toggle('reached', done >= goal);

  const wrong = results.filter(r => !r.correct);
  const right = results.filter(r => r.correct);
  const room = Math.max(1, 4 - wrong.length);
  const shown = right.length <= room + 1 ? right : right.slice(0, room);
  const rest = right.length - shown.length;
  $('#summary-list').innerHTML = wrong.map(r => summaryRow('x', r.word, r.typed ? `you wrote ${markTyped(r.typed, r.word)}` : 'skipped')).join('')
    + shown.map(r => summaryRow('k', r.word, 'correct')).join('')
    + (rest ? `<div class="wl-row k"><i>&#10003;</i>${plural(rest, 'more word')}<em>all correct</em></div>` : '');

  $('#retry-mistakes').hidden = !missed;
  $('#retry-mistakes').textContent = `Practise the ${plural(missed, 'mistake')}`;
  openPlay('summary');
  $('#summary .res-body').scrollTop = 0;
  renderHome();
}

$('#retry-mistakes').addEventListener('click', () => {
  startSession(session.results.filter(r => !r.correct).map(r => r.word), 'Practising mistakes');
});
$('#new-session').addEventListener('click', showSetup);
$('#summary-close').addEventListener('click', showSetup);

/* ---------- Full entry sheet ---------- */

const CLOSE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
let sheetWord = '';

const sheetTop = (word, sub) => `<div class="sheet-top">
    <div><p class="word-big" id="sheet-word">${esc(word)}</p>${sub ? `<p class="phon">${sub}</p>` : ''}</div>
    <button class="icon-btn" type="button" data-close-sheet aria-label="Close">${CLOSE_ICON}</button>
  </div>`;

const wordChips = list => list.slice(0, 20)
  .map(w => `<button class="chip link" type="button" data-sheet-word="${esc(w)}">${esc(w)}</button>`).join('');

function sheetHtml(word, entries) {
  if (!entries) return `${sheetTop(word, '')}<p class="muted">No dictionary entry found for this word.</p>`;
  const headword = entries[0].word;
  const phonetics = entries.flatMap(e => e.phonetics || []);
  const text = entries.map(e => e.phonetic).concat(phonetics.map(p => p.text)).find(Boolean);
  const audio = new Map();
  phonetics.filter(p => p.audio).forEach(p => {
    const accent = accentOf(p.audio);
    if (!audio.has(accent)) audio.set(accent, p.audio);
  });
  const syl = syllables(headword);
  const groups = new Map([...groupMeanings(entries)]
    .sort(([, a], [, b]) => a.defs.every(isLabelled) - b.defs.every(isLabelled)));
  const defs = [...groups.values()].flatMap(g => g.defs);
  const examples = [...new Set(defs.map(d => d.example).filter(Boolean))];
  const syn = [...new Set([...groups.values()].flatMap(g => [...g.syn]))];
  const ant = [...new Set([...groups.values()].flatMap(g => [...g.ant]))];

  const meaning = [...groups].map(([pos, g]) => `<p class="pos">${esc(pos)}</p>
    <ol class="defs">${g.defs.map(d => `<li>${esc(d.definition)}${d.example ? `<p class="example">"${esc(d.example)}"</p>` : ''}</li>`).join('')}</ol>`).join('');

  return `${sheetTop(headword, `${text ? `${esc(text)} &middot; ` : ''}${plural(syl, 'syllable')}`)}
    <div class="sheet-actions">
      <button class="btn small" type="button" data-speak="${esc(headword)}">Speak</button>
      ${[...audio].map(([accent, url]) => `<button class="btn ghost small" type="button" data-audio="${esc(url)}">${esc(accent)}</button>`).join('')}
      <button class="btn ghost small" type="button" data-spell="${esc(headword)}">Spell out</button>
    </div>
    <div class="seg3" role="tablist">
      <button class="on" type="button" role="tab" aria-selected="true" data-sheet-tab="meaning">Meaning</button>
      <button type="button" role="tab" aria-selected="false" data-sheet-tab="examples">Examples</button>
      <button type="button" role="tab" aria-selected="false" data-sheet-tab="similar">Similar</button>
    </div>
    <div class="sheet-scroll">
      <div class="sheet-pane" data-sheet-pane="meaning">
        ${meaning}
        ${syn.length ? `<div class="related sheet-similar"><span>Similar</span>${wordChips(syn.slice(0, 3))}</div>` : ''}
      </div>
      <div class="sheet-pane" data-sheet-pane="examples" hidden>
        ${examples.length ? `<ul class="ex-list">${examples.map(x => `<li class="example">"${esc(x)}"</li>`).join('')}</ul>` : '<p class="muted">No example sentences for this word yet.</p>'}
      </div>
      <div class="sheet-pane" data-sheet-pane="similar" hidden>
        ${syn.length ? `<p class="pos">Synonyms</p><div class="related">${wordChips(syn)}</div>` : ''}
        ${ant.length ? `<p class="pos">Opposites</p><div class="related">${wordChips(ant)}</div>` : ''}
        ${syn.length || ant.length ? '' : '<p class="muted">No similar words are listed for this word.</p>'}
      </div>
    </div>`;
}

async function openSheet(word) {
  sheetWord = word;
  $('#sheet-wrap').hidden = false;
  $('#sheet-body').innerHTML = `${sheetTop(word, '')}<p class="muted">Looking up...</p>`;
  try {
    const entries = await lookup(word);
    if (sheetWord === word) $('#sheet-body').innerHTML = sheetHtml(word, entries);
  } catch (err) {
    if (sheetWord === word) $('#sheet-body').innerHTML = `${sheetTop(word, '')}<p class="error">Couldn't load the dictionary entry. ${esc(err.message)}</p>`;
  }
}

function closeSheet() {
  sheetWord = '';
  $('#sheet-wrap').hidden = true;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-close-sheet],[data-sheet-tab],[data-sheet-word]');
  if (!t) return;
  if (t.dataset.sheetWord) openSheet(t.dataset.sheetWord);
  else if (t.dataset.sheetTab) {
    $$('[data-sheet-tab]').forEach(b => {
      const on = b === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    $$('[data-sheet-pane]').forEach(p => (p.hidden = p.dataset.sheetPane !== t.dataset.sheetTab));
  } else closeSheet();
});

/* ---------- Progress tab ---------- */

function renderProgress() {
  const history = store.get('history', []);
  const mistakes = store.get('mistakes', []);
  const total = history.reduce((s, h) => s + h.total, 0);
  const correct = history.reduce((s, h) => s + h.score, 0);
  const { current: streak, best, totals } = streakInfo();

  $('#stats').innerHTML = `
    <div class="stat"><b>${streak}</b><span>day streak (best ${best})</span></div>
    <div class="stat"><b>${total}</b><span>words practised</span></div>
    <div class="stat"><b>${total ? Math.round((correct / total) * 100) : 0}%</b><span>accuracy</span></div>
    <div class="stat"><b>${mistakes.length}</b><span>words to revise</span></div>`;

  const today = new Date();
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  $('#calendar').innerHTML =
    days.slice(0, 7).map(d => `<span class="cal-label">${esc(d.toLocaleDateString(undefined, { weekday: 'narrow' }))}</span>`).join('')
    + days.map(d => {
      const n = totals.get(dayKey(d)) || 0;
      const level = n === 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : 3;
      return `<span class="cal-day level-${level}${dayKey(d) === dayKey(today) ? ' today' : ''}" title="${esc(d.toDateString())}: ${plural(n, 'word')}"></span>`;
    }).join('');

  $('#mistake-list').innerHTML = mistakes.length ? chips(mistakes) : '<p class="muted">No words to revise yet.</p>';

  $('#history-list').innerHTML = history.length
    ? `<table>
        <thead><tr><th>Date</th><th>List</th><th>Score</th></tr></thead>
        <tbody>${history.slice(0, 50).map(h => `<tr>
          <td>${new Date(h.date).toLocaleString()}</td>
          <td>${esc(h.list)}</td>
          <td>${h.score} / ${h.total}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '<p class="muted">No sessions yet. Start a dictation to see your history here.</p>';
}

$('#clear-progress').addEventListener('click', () => {
  if (!confirm('Clear all saved progress, mistakes and history?')) return;
  ['history', 'mistakes', 'recent'].forEach(k => localStorage.removeItem(k));
  renderProgress();
  renderRecent();
  renderHome();
});

/* ---------- Init ---------- */

renderHome();
renderRecent();
