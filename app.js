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
  store.set('wordwise-theme', next);
});

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

/* ---------- Tabs ---------- */

function showTab(name) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => (p.hidden = p.id !== name));
  if (name === 'progress') renderProgress();
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- Speech ---------- */

const canSpeak = 'speechSynthesis' in window;
let voices = [];

function loadVoices() {
  voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
  const saved = store.get('voice', '');
  $('#voice').innerHTML = voices.length
    ? voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')
    : '<option value="">Default voice</option>';
  if (voices.some(v => v.name === saved)) $('#voice').value = saved;
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

function speak(text, rate = +$('#rate').value) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = voices.find(v => v.name === $('#voice').value);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-US';
  u.rate = rate;
  speechSynthesis.speak(u);
}

const spellOut = word => speak(word.toUpperCase().split('').join(', '), 0.7);

/* ---------- Dictionary data ---------- */

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const cache = new Map();

async function lookup(word) {
  const key = word.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(API + encodeURIComponent(key));
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
  const meaningsHtml = [...groups].map(([pos, g]) => `
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

/* ---------- Dictation ---------- */

const session = { words: [], index: 0, results: [], checked: false, label: '' };
const current = () => session.words[session.index];

function listLabel(key) {
  if (key === 'mistakes') return 'My mistakes';
  if (key === 'custom') return 'My own words';
  return WORD_LISTS[key].label;
}

function populateLists() {
  const selected = $('#list').value;
  $('#list').innerHTML = Object.entries(WORD_LISTS)
    .map(([key, l]) => `<option value="${key}">${esc(l.label)} (${l.words.length})</option>`).join('')
    + `<option value="mistakes">My mistakes (${store.get('mistakes', []).length})</option>`
    + '<option value="custom">My own words</option>';
  if (selected) $('#list').value = selected;
}

$('#list').addEventListener('change', () => ($('#custom-wrap').hidden = $('#list').value !== 'custom'));
$('#custom-words').value = store.get('customWords', '');

$('#import-file').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '').replace(/^\uFEFF/, '');
    const current = $('#custom-words').value.trim();
    $('#custom-words').value = current ? `${current}\n${text}` : text;
    store.set('customWords', $('#custom-words').value);
    toast(`Imported ${file.name}`);
    e.target.value = '';
  };
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsText(file);
});

const parseCustom = text => [...new Set(text.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean))];

function startSession(words, label) {
  Object.assign(session, { words, index: 0, results: [], label });
  $('#setup').hidden = true;
  $('#summary').hidden = true;
  $('#session').hidden = false;
  showWord();
}

$('#setup').addEventListener('submit', e => {
  e.preventDefault();
  const key = $('#list').value;
  let words;
  if (key === 'custom') {
    store.set('customWords', $('#custom-words').value);
    words = parseCustom($('#custom-words').value);
  } else if (key === 'mistakes') {
    words = store.get('mistakes', []);
  } else {
    words = WORD_LISTS[key].words.slice();
  }

  if (!words.length) {
    $('#setup-error').textContent = key === 'mistakes' ? 'You have no saved mistakes yet.' : 'Add at least one word.';
    return;
  }
  $('#setup-error').textContent = '';
  if ($('#shuffle').checked) words = shuffle(words);
  const count = +$('#count').value;
  if (count) words = words.slice(0, count);
  startSession(words, listLabel(key));
});

function showWord() {
  session.checked = false;
  $('#progress-text').textContent = `Word ${session.index + 1} of ${session.words.length}`;
  $('#progress-bar').style.width = `${(session.index / session.words.length) * 100}%`;
  $('#answer').value = '';
  $('#answer').disabled = false;
  $('#answer').focus();
  $('#feedback').innerHTML = '';
  $('#word-details').innerHTML = '';
  $('#check').textContent = 'Check';
  $('#skip').disabled = false;
  setTimeout(() => speak(current()), 300);
  lookup(current()).catch(() => {});
}

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
$('#play-slow').addEventListener('click', () => speak(current(), 0.55));
$('#play-sentence').addEventListener('click', speakSentence);
$('#play-meaning').addEventListener('click', speakMeaning);

function diffHtml(typed, correct) {
  const a = typed.toLowerCase();
  const b = correct.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const out = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && a[i - 1] === b[j - 1];
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (same ? 0 : 1)) {
      if (same) out.push(`<span>${esc(correct[j - 1])}</span>`);
      else out.push(`<ins>${esc(correct[j - 1])}</ins>`, `<del>${esc(typed[i - 1])}</del>`);
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      out.push(`<del>${esc(typed[i - 1])}</del>`);
      i--;
    } else {
      out.push(`<ins>${esc(correct[j - 1])}</ins>`);
      j--;
    }
  }
  return out.reverse().join('');
}

function updateMistakes(word, correct) {
  const mistakes = new Set(store.get('mistakes', []));
  if (correct) mistakes.delete(word);
  else mistakes.add(word);
  store.set('mistakes', [...mistakes]);
}

async function record(word, typed) {
  const correct = typed.toLowerCase() === word.toLowerCase();
  const index = session.index;
  session.results.push({ word, typed, correct });
  session.checked = true;
  updateMistakes(word, correct);

  $('#answer').disabled = true;
  $('#skip').disabled = true;
  $('#feedback').innerHTML = correct
    ? `<p class="ok">Correct! <b>${esc(word)}</b></p>`
    : `<p class="bad">${typed ? 'Not quite.' : 'Skipped.'} The correct spelling is <b>${esc(word)}</b>.</p>
       ${typed ? `<p class="diff">${diffHtml(typed, word)}</p>
       <p class="muted small">Red letters are wrong or extra; green letters are the ones you missed.</p>` : ''}`;
  $('#check').textContent = index + 1 < session.words.length ? 'Next word' : 'See results';
  $('#check').focus();

  $('#word-details').innerHTML = '<p class="muted">Loading word details...</p>';
  try {
    const html = wordCard(word, await lookup(word));
    if (session.index === index && session.checked) $('#word-details').innerHTML = html;
  } catch (err) {
    if (session.index === index) $('#word-details').innerHTML = errorCard(err);
  }
}

function next() {
  session.index++;
  if (session.index < session.words.length) showWord();
  else finish();
}

$('#answer-form').addEventListener('submit', e => {
  e.preventDefault();
  if (session.checked) return next();
  const typed = $('#answer').value.trim();
  if (!typed) return $('#answer').focus();
  record(current(), typed);
});

$('#skip').addEventListener('click', () => { if (!session.checked) record(current(), ''); });

$('#quit').addEventListener('click', () => {
  if (session.results.length) finish();
  else showSetup();
});

function showSetup() {
  if (canSpeak) speechSynthesis.cancel();
  populateLists();
  $('#session').hidden = true;
  $('#summary').hidden = true;
  $('#setup').hidden = false;
}

function finish() {
  if (canSpeak) speechSynthesis.cancel();
  const { results } = session;
  const score = results.filter(r => r.correct).length;
  const history = store.get('history', []);
  history.unshift({ date: new Date().toISOString(), list: session.label, score, total: results.length });
  store.set('history', history.slice(0, 50));

  const pct = Math.round((score / results.length) * 100);
  $('#summary-score').textContent = `${score} / ${results.length}`;
  $('#summary-message').textContent = pct === 100 ? 'Perfect score!' : pct >= 70 ? 'Great work. Review the words below.' : 'Keep practising. Tap a word to study it.';
  $('#summary-list').innerHTML = results.map(r => `<li class="${r.correct ? 'ok' : 'bad'}">
      <button class="link" data-lookup="${esc(r.word)}">${esc(r.word)}</button>
      ${r.correct ? '' : `<span class="muted">you wrote: ${r.typed ? esc(r.typed) : '(skipped)'}</span>`}
    </li>`).join('');
  $('#retry-mistakes').hidden = score === results.length;

  $('#session').hidden = true;
  $('#summary').hidden = false;
  populateLists();
}

$('#retry-mistakes').addEventListener('click', () => {
  startSession(session.results.filter(r => !r.correct).map(r => r.word), 'Retry');
});
$('#new-session').addEventListener('click', showSetup);

/* ---------- Progress tab ---------- */

function renderProgress() {
  const history = store.get('history', []);
  const mistakes = store.get('mistakes', []);
  const total = history.reduce((s, h) => s + h.total, 0);
  const correct = history.reduce((s, h) => s + h.score, 0);

  $('#stats').innerHTML = `
    <div class="stat"><b>${history.length}</b><span>sessions</span></div>
    <div class="stat"><b>${total}</b><span>words practised</span></div>
    <div class="stat"><b>${total ? Math.round((correct / total) * 100) : 0}%</b><span>accuracy</span></div>
    <div class="stat"><b>${mistakes.length}</b><span>words to revise</span></div>`;

  $('#mistake-list').innerHTML = mistakes.length ? chips(mistakes) : '<p class="muted">No words to revise yet.</p>';

  $('#history-list').innerHTML = history.length
    ? `<table>
        <thead><tr><th>Date</th><th>List</th><th>Score</th></tr></thead>
        <tbody>${history.map(h => `<tr>
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
  populateLists();
});

/* ---------- Init ---------- */

populateLists();
renderRecent();
