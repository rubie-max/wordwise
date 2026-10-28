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

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#0a0c18' : '#f4f3fb';
  store.set('wordwise-theme', theme);
  renderPills('#theme-pills', 'themeChoice', theme);
}

// Marks the matching button in a segmented control as chosen.
function renderPills(group, key, value) {
  $$(`${group} button`).forEach(b => {
    const on = b.dataset[key] === String(value);
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
}

$('#theme-toggle').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
$('#theme-pills').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-choice]');
  if (b) setTheme(b.dataset.themeChoice);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (store.get(AUTH_KEY, '') === ACCESS_USER) unlockApp();

function toast(message, action) {
  const el = $('#toast');
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      el.hidden = true;
      action.run();
    });
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), action ? 5000 : 2800);
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
    panel.classList.add('popover');
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('click', e => e.stopPropagation());
}

// The voice controls live in Settings and borrow a popover during a session.
bindPopover('#session-voice', '#voice-panel');
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
  if (name === 'settings') renderSettings();
  if (name === 'words') renderBank();
  window.scrollTo({ top: 0 });
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#account-toggle').addEventListener('click', () => showTab('settings'));

/* ---------- Settings ---------- */

function renderSettings() {
  const panel = $('#voice-panel');
  panel.classList.remove('popover');
  panel.hidden = false;
  $('#voice-slot').append(panel);
  renderPills('#theme-pills', 'themeChoice', document.documentElement.dataset.theme);
  renderPills('#goal-pills', 'goal', store.get('dailyGoal', 10));
  const prefs = soundPrefs();
  $('#sfx-on').checked = prefs.sfx;
  $('#buzz-on').checked = prefs.buzz;
  $('#say-after').checked = store.get('sayAfterCheck', true);
  renderPills('#key-pills', 'keyMode', prefs.keyMode);

  const canFull = fullscreenSupported();
  const homeScreen = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('#fs-on').checked = canFull && store.get('fullscreen', true);
  $('#fs-on').disabled = !canFull;
  $('#fs-sub').textContent = canFull ? 'Hides the browser bars when a dictation starts, and brings them back when it ends.'
    : homeScreen ? 'Not needed: WordWise is open from your Home Screen, so there are no browser bars.'
    : 'Not available in this browser';
  $('#fs-tip').hidden = canFull || homeScreen;
}

$('#say-after').addEventListener('change', e => store.set('sayAfterCheck', e.target.checked));
$('#sfx-on').addEventListener('change', e => {
  store.set('sfx', e.target.checked);
  sound('correct');
});
$('#key-pills').addEventListener('click', e => {
  const b = e.target.closest('[data-key-mode]');
  if (!b) return;
  store.set('keyMode', b.dataset.keyMode);
  renderPills('#key-pills', 'keyMode', b.dataset.keyMode);
  if (b.dataset.keyMode === 'say') loadLetterClips();
  keyFeedback('a');
});
$('#buzz-on').addEventListener('change', e => {
  store.set('vibrate', e.target.checked);
  buzz(30);
});

$('#goal-pills').addEventListener('click', e => {
  const b = e.target.closest('[data-goal]');
  if (!b) return;
  store.set('dailyGoal', +b.dataset.goal);
  renderPills('#goal-pills', 'goal', +b.dataset.goal);
  renderHome();
});

$('#copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#gpt-prompt').textContent);
    toast('Copied. Paste it into ChatGPT.');
  } catch {
    toast('Copy did not work. Press and hold the text to copy it.');
  }
});

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

// Phone browsers can drop new speech, or replay the old speech, when it starts the moment
// the old speech is stopped. Waiting a beat after stopping avoids that.
function makeUtterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  const voice = voices.find(v => v.name === $('#voice').value);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-US';
  u.rate = rate;
  return u;
}

function utter(text, rate, id, pause = 150) {
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  speechSynthesis.cancel();
  const u = makeUtterance(text, rate);
  utter.last = u;
  const go = () => { if (id === speakId) speechSynthesis.speak(u); };
  if (busy && pause) setTimeout(go, pause);
  else go();
  return u;
}

function speak(text, rate = +$('#rate').value) {
  if (!canSpeak || !text) return;
  const id = ++speakId;
  const u = utter(text, rate, id);
  u.onstart = () => setSpeaking(true);
  u.onend = u.onerror = () => { if (id === speakId) setSpeaking(false); };
}

const slowRate = () => Math.max(0.3, +$('#rate').value * 0.5);

// Spelling follows your speed setting, a touch slower so each letter stands apart.
const spellRate = () => +$('#rate').value * 0.95;
const spellOut = word => speak(word.toUpperCase().split('').join(', '), spellRate());

$('#voice-test').addEventListener('click', () => speak('Necessary. This is how your dictation will sound.'));

/* ---------- Sound effects ---------- */

// Synthesised with Web Audio, so there are no sound files to download or cache.
const sfx = { ctx: null, noise: null };

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sfx.ctx) sfx.ctx = new AC();
  if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
  return sfx.ctx;
}

// notes: [frequency in Hz, start in seconds, length in seconds]
function tones(notes, { type = 'triangle', volume = 0.2 } = {}) {
  const ctx = audioCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  for (const [freq, start, len] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + len + 0.05);
  }
}

function keyClick(freq) {
  const ctx = audioCtx();
  if (!ctx) return;
  if (!sfx.noise) {
    const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.025), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    sfx.noise = buf;
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = sfx.noise;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  gain.gain.value = 0.5;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

const SOUNDS = {
  start: () => tones([[523.25, 0, 0.12], [783.99, 0.08, 0.22]], { volume: 0.12 }),
  correct: () => tones([[659.25, 0, 0.16], [987.77, 0.08, 0.34]]),
  streak: () => tones([[659.25, 0, 0.12], [830.61, 0.07, 0.12], [987.77, 0.14, 0.12], [1318.51, 0.21, 0.42]], { volume: 0.18 }),
  wrong: () => tones([[329.63, 0, 0.16], [246.94, 0.13, 0.34]], { type: 'sine', volume: 0.26 }),
  skip: () => tones([[440, 0, 0.1], [392, 0.07, 0.16]], { type: 'sine', volume: 0.12 }),
  complete: () => tones([[523.25, 0, 0.16], [659.25, 0.12, 0.16], [783.99, 0.24, 0.16], [1046.5, 0.36, 0.55]], { volume: 0.18 }),
  perfect: () => tones([[523.25, 0, 0.14], [659.25, 0.1, 0.14], [783.99, 0.2, 0.14], [1046.5, 0.3, 0.2], [1318.51, 0.42, 0.2], [1567.98, 0.54, 0.65]], { volume: 0.17 }),
  goal: () => tones([[1046.5, 0, 0.1], [1318.51, 0.08, 0.1], [1567.98, 0.16, 0.1], [2093, 0.24, 0.4]], { type: 'sine', volume: 0.1 }),
};

const soundPrefs = () => ({
  sfx: store.get('sfx', true),
  buzz: store.get('vibrate', true),
  keyMode: store.get('keyMode', store.get('keySounds', true) ? 'say' : 'off'),
});

function sound(name) {
  if (soundPrefs().sfx) SOUNDS[name]?.();
}

function buzz(pattern) {
  if (soundPrefs().buzz && navigator.vibrate) navigator.vibrate(pattern);
}

const KEY_NAMES = { ' ': 'space', "'": 'apostrophe', '-': 'dash' };

// Voices pad each letter with up to a second of silence, so queueing every letter falls far
// behind fast typing. Instead a new key cuts off the last letter once its sound has played
// (about a quarter of a second at this rate), and clicks if the last letter has only just started.
// Letters skip the pause after stopping speech, because any delay here eats into the next key.
const letterVoice = { id: -1, queuedAt: 0, startedAt: 0, ms: 0 };

function letterBusy() {
  if (letterVoice.id !== speakId) return false;
  const now = performance.now();
  if (now - letterVoice.queuedAt > 1500) return false;
  return !letterVoice.startedAt || now - letterVoice.startedAt < letterVoice.ms;
}

// Recorded letter names in one file (made with Windows' Zira voice, letter-spelling mode),
// as [start, length] in seconds. Clips play instantly, so fast typing hears every letter.
const LETTER_CLIPS = {
  a: [0, 0.2404], b: [0.3004, 0.2551], c: [0.6155, 0.3479], d: [1.0234, 0.2728], e: [1.3561, 0.2391],
  f: [1.6552, 0.4004], g: [2.1156, 0.3259], h: [2.5015, 0.3974], i: [2.9589, 0.2442], j: [3.2631, 0.3768],
  k: [3.6999, 0.334], l: [4.0939, 0.3482], m: [4.5022, 0.3718], n: [4.934, 0.3792], o: [5.3732, 0.2443],
  p: [5.6775, 0.2981], q: [6.0356, 0.3698], r: [6.4654, 0.3518], s: [6.8771, 0.4045], t: [7.3416, 0.3182],
  u: [7.7198, 0.3081], v: [8.0879, 0.2801], w: [8.428, 0.5334], x: [9.0214, 0.4539], y: [9.5353, 0.2962],
  z: [9.8915, 0.3271], space: [10.2786, 0.6272], apostrophe: [10.9658, 0.7964], dash: [11.8222, 0.4404],
};
const letterAudio = { buffer: null, loading: null, playing: null };

function loadLetterClips() {
  const ctx = audioCtx();
  if (!ctx || letterAudio.loading) return;
  letterAudio.loading = fetch('letters.wav?v=1')
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then(data => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
    .then(buffer => { letterAudio.buffer = buffer; })
    .catch(() => { letterAudio.loading = null; });
}

function playLetterClip(key) {
  const clip = LETTER_CLIPS[KEY_NAMES[key] || key];
  const ctx = audioCtx();
  if (!clip || !ctx || !letterAudio.buffer) return false;
  const now = ctx.currentTime;
  const prev = letterAudio.playing;
  if (prev) {
    prev.gain.gain.setTargetAtTime(0, now, 0.01);
    prev.src.stop(now + 0.05);
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = letterAudio.buffer;
  gain.gain.value = 0.9;
  src.connect(gain).connect(ctx.destination);
  src.start(now, clip[0], clip[1]);
  letterAudio.playing = { src, gain };
  return true;
}

function sayKey(key) {
  if (playLetterClip(key)) {
    // The first letter typed stops a word or meaning that is still being read out.
    if (canSpeak && (speechSynthesis.speaking || speechSynthesis.pending)) {
      speakId++;
      setSpeaking(false);
      speechSynthesis.cancel();
    }
    return;
  }
  loadLetterClips();
  if (!canSpeak) return;
  if (letterBusy()) {
    keyClick(1900);
    return;
  }
  setSpeaking(false);
  const id = ++speakId;
  const name = KEY_NAMES[key];
  Object.assign(letterVoice, { id, queuedAt: performance.now(), startedAt: 0, ms: name || key === 'w' ? 500 : 260 });
  const u = utter(name || key.toUpperCase(), 1.5, id, 0);
  u.onstart = () => { if (letterVoice.id === id) letterVoice.startedAt = performance.now(); };
  u.onend = u.onerror = () => { if (letterVoice.id === id) letterVoice.id = -1; };
}

function keyFeedback(key) {
  const { keyMode } = soundPrefs();
  if (keyMode === 'say') {
    if (key === 'Backspace') keyClick(1100);
    else sayKey(key);
  } else if (keyMode === 'click') keyClick(key === 'Backspace' ? 1100 : 1900);
  else if (keyMode === 'buzz' && navigator.vibrate) navigator.vibrate(8);
}

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

const SPEAKER_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const spoken = text => `${esc(text)}<button class="say" type="button" data-speak="${esc(text)}" aria-label="Read aloud" title="Read aloud">${SPEAKER_ICON}</button>`;
const defItem = d => `<li>${spoken(d.definition)}${d.example ? `<p class="example">${spoken(`"${d.example}"`)}</p>` : ''}</li>`;

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
      <ol>${g.defs.map(defItem).join('')}</ol>
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

const session = { words: [], index: 0, results: [], checked: false, label: '', started: 0, typed: '', askedAt: 0 };
const current = () => session.words[session.index];
const parseCustom = text => [...new Set(text.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean))];

// Own words as { word, meaning, example }, oldest first. Older versions kept a plain text list.
const bankKey = w => String(w).trim().toLowerCase();
let bank = store.get('wordBank', null);
if (!Array.isArray(bank)) {
  bank = parseCustom(store.get('customWords', '')).map(word => ({ word, meaning: '', example: '' }));
  store.set('wordBank', bank);
  localStorage.removeItem('customWords');
}
const saveBank = () => store.set('wordBank', bank);
const bankEntry = word => bank.find(b => bankKey(b.word) === bankKey(word));

function listLabel(key) {
  if (key === 'mistakes') return 'My mistakes';
  if (key === 'custom') return 'My own words';
  return WORD_LISTS[key].label;
}

function listWords(key) {
  if (key === 'custom') return bank.map(b => b.word);
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
  renderBank();
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
  if (selectedList === 'custom' && !listWords('custom').length) {
    showTab('words');
    showPane('add');
    $('#add-word').focus();
  }
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

$('#practise-custom').addEventListener('click', () => {
  selectedList = 'custom';
  store.set('selectedList', selectedList);
  renderLists();
  $('#setup').requestSubmit();
});

/* ---------- Word bank ---------- */

const PENCIL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TRASH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
const WORD_OK = /^[a-z][a-z' -]*$/i;
const cleanText = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/^["\u201c\u201d]+|["\u201c\u201d]+$/g, '').trim();
const cleanWord = s => cleanText(s).replace(/^'+|[.,;:!?]+$/g, '').trim();
const wordProblem = w => (!w ? 'Type a word.'
  : w.length > MAX_TYPED ? 'That word is too long.'
  : !WORD_OK.test(w) ? 'Words can only use letters, spaces, hyphens and apostrophes.' : '');

let bankFilter = 'all';
let editingKey = '';
let pendingImport = null;

function showPane(name) {
  renderPills('#words-tabs', 'pane', name);
  $$('[data-pane-body]').forEach(p => (p.hidden = p.dataset.paneBody !== name));
  if (name === 'bank') renderBank();
}

$('#words-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-pane]');
  if (b) showPane(b.dataset.pane);
});
$('#words').addEventListener('click', e => {
  const b = e.target.closest('[data-goto-pane]');
  if (b) showPane(b.dataset.gotoPane);
});

const bankItem = b => `<li class="bank-item">
    <div class="bank-main">
      <p class="bank-word">${esc(b.word)}<button class="say" type="button" data-speak="${esc(b.word)}" aria-label="Say ${esc(b.word)}" title="Say the word">${SPEAKER_ICON}</button></p>
      ${b.meaning ? `<p class="bank-def">${spoken(b.meaning)}</p>` : '<p class="bank-def none">No meaning yet</p>'}
      ${b.example ? `<p class="example">${spoken(`"${b.example}"`)}</p>` : ''}
    </div>
    <div class="bank-actions">
      <button class="icon-btn" type="button" data-edit-word="${esc(b.word)}" aria-label="Edit ${esc(b.word)}" title="Edit">${PENCIL_ICON}</button>
      <button class="icon-btn" type="button" data-delete-word="${esc(b.word)}" aria-label="Delete ${esc(b.word)}" title="Delete">${TRASH_ICON}</button>
    </div>
  </li>`;

function renderBank() {
  const withMeaning = bank.filter(b => b.meaning).length;
  $('#bank-count').textContent = bank.length
    ? `${plural(bank.length, 'word')}, ${withMeaning} with a meaning. Saved in this browser.`
    : 'Saved in this browser.';
  $('#practise-custom').hidden = !bank.length;
  $('#bank-tools').hidden = !bank.length;
  $('#bank-foot').hidden = !bank.length;
  $('#bank-empty').hidden = Boolean(bank.length);
  $('#fill-meanings').hidden = withMeaning === bank.length;
  renderPills('#bank-filter', 'filter', bankFilter);
  const q = $('#bank-search').value.trim().toLowerCase();
  const rows = bank.slice().reverse()
    .filter(b => bankFilter === 'all' || (bankFilter === 'meaning') === Boolean(b.meaning))
    .filter(b => !q || b.word.toLowerCase().includes(q) || (b.meaning || '').toLowerCase().includes(q));
  $('#bank-list').innerHTML = rows.length || !bank.length
    ? rows.map(bankItem).join('')
    : '<li class="bank-none muted small">No words match.</li>';
}

$('#bank-search').addEventListener('input', renderBank);
$('#bank-filter').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  bankFilter = b.dataset.filter;
  renderBank();
});

$('#bank-list').addEventListener('click', e => {
  const edit = e.target.closest('[data-edit-word]');
  const del = e.target.closest('[data-delete-word]');
  if (edit) startEdit(edit.dataset.editWord);
  if (!del) return;
  const i = bank.findIndex(b => bankKey(b.word) === bankKey(del.dataset.deleteWord));
  if (i < 0) return;
  const [removed] = bank.splice(i, 1);
  saveBank();
  renderLists();
  toast(`Deleted "${removed.word}"`, {
    label: 'Undo',
    run: () => {
      bank.splice(i, 0, removed);
      saveBank();
      renderLists();
    },
  });
});

$('#clear-bank').addEventListener('click', () => {
  if (!confirm(`Delete all ${plural(bank.length, 'word')} from your word bank? Export a backup first if you might want them later.`)) return;
  bank = [];
  saveBank();
  renderLists();
});

$('#fill-meanings').addEventListener('click', async () => {
  const btn = $('#fill-meanings');
  const todo = bank.filter(b => !b.meaning);
  let found = 0;
  btn.disabled = true;
  for (let i = 0; i < todo.length; i++) {
    btn.textContent = `Finding meanings ${i + 1} of ${todo.length}\u2026`;
    try {
      const { def, example } = entryFacts(await lookup(todo[i].word));
      if (def) {
        todo[i].meaning = def;
        if (!todo[i].example) todo[i].example = example;
        found++;
      }
    } catch {}
  }
  saveBank();
  btn.disabled = false;
  btn.textContent = 'Fill missing meanings';
  renderBank();
  const missed = todo.length - found;
  toast(found
    ? `Added ${plural(found, 'meaning')}.${missed ? ` ${missed} not found in the dictionary.` : ''}`
    : 'The dictionary had no meanings for these words.');
});

/* Add or edit one word */

function resetAddForm() {
  editingKey = '';
  $('#add-form').reset();
  $('#add-title').textContent = 'Add a word';
  $('#add-save').textContent = 'Add to word bank';
  $('#add-cancel').hidden = true;
  $('#add-error').textContent = '';
}

function startEdit(word) {
  const b = bankEntry(word);
  if (!b) return;
  showPane('add');
  editingKey = bankKey(b.word);
  $('#add-word').value = b.word;
  $('#add-meaning').value = b.meaning || '';
  $('#add-example').value = b.example || '';
  $('#add-title').textContent = `Edit "${b.word}"`;
  $('#add-save').textContent = 'Save changes';
  $('#add-cancel').hidden = false;
  $('#add-error').textContent = '';
  $('#add-word').focus();
}

$('#add-cancel').addEventListener('click', () => {
  resetAddForm();
  showPane('bank');
});

$('#add-form').addEventListener('submit', e => {
  e.preventDefault();
  const word = cleanWord($('#add-word').value);
  const meaning = cleanText($('#add-meaning').value);
  const example = cleanText($('#add-example').value);
  const problem = wordProblem(word);
  const error = msg => {
    $('#add-error').textContent = msg;
    $('#add-word').focus();
  };
  if (problem) return error(problem);
  const same = bankEntry(word);

  if (editingKey) {
    const b = bankEntry(editingKey);
    if (same && same !== b) return error(`"${same.word}" is already in your word bank.`);
    if (b) Object.assign(b, { word, meaning, example });
    else bank.push({ word, meaning, example });
    saveBank();
    resetAddForm();
    showPane('bank');
    renderLists();
    toast(`Saved "${word}"`);
    return;
  }

  if (same) {
    if (!meaning && !example) return error(`"${same.word}" is already in your word bank.`);
    if (meaning) same.meaning = meaning;
    if (example) same.example = example;
    toast(`Updated "${same.word}"`);
  } else {
    bank.push({ word, meaning, example });
    toast(`Added "${word}"`);
  }
  saveBank();
  resetAddForm();
  renderLists();
  $('#add-word').focus();
});

$('#find-meaning').addEventListener('click', async () => {
  const word = cleanWord($('#add-word').value);
  const btn = $('#find-meaning');
  if (!word) {
    $('#add-error').textContent = 'Type the word first.';
    $('#add-word').focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Looking up\u2026';
  try {
    const { def, example } = entryFacts(await lookup(word));
    if (def) {
      $('#add-meaning').value = def;
      if (!$('#add-example').value.trim()) $('#add-example').value = example;
      $('#add-error').textContent = '';
    } else {
      $('#add-error').textContent = `The dictionary has no meaning for "${word}". You can type your own.`;
    }
  } catch {
    $('#add-error').textContent = "Couldn't reach the dictionary. Try again in a moment.";
  }
  btn.disabled = false;
  btn.textContent = 'Find in dictionary';
});

/* Import */

// Splits one CSV line, keeping commas that sit inside quotes.
function splitCells(line, delim) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  cells.push(cell);
  return cells.map(s => s.trim());
}

function parseLine(raw) {
  const line = raw.replace(/^\s*(?:\d+[.)]\s+|[-*\u2022]\s+)/, '').trim();
  if (!line) return [];
  if (/[\t|]/.test(line)) {
    const [word, meaning = '', example = ''] = line.split(/\s*[\t|]\s*/);
    return [{ word, meaning, example }];
  }
  const pair = line.match(/^(.+?)\s*(?:\s-\s|[\u2013\u2014:=])\s*(.+)$/);
  if (pair && !pair[1].includes(',')) return [{ word: pair[1], meaning: pair[2] }];
  const cells = splitCells(line, line.includes(',') ? ',' : ';');
  // A cell with several words is a meaning, not another word to practise.
  if (cells.length > 1 && cells.slice(1).some(c => c.split(/\s+/).length > 2)) {
    return [{ word: cells[0], meaning: cells[1], example: cells[2] || '' }];
  }
  return cells.map(word => ({ word }));
}

function readImport(text) {
  const t = text.replace(/^\uFEFF/, '').trim();
  if (/^[[{]/.test(t)) {
    try {
      const data = JSON.parse(t);
      if (data && data.app === 'WordWise') return { backup: data, rows: Array.isArray(data.words) ? data.words : [] };
      const list = Array.isArray(data) ? data : Array.isArray(data.words) ? data.words : [];
      return {
        rows: list.map(x => (typeof x === 'string' ? { word: x }
          : { word: x?.word || x?.term, meaning: x?.meaning || x?.definition, example: x?.example })),
      };
    } catch {}
  }
  const rows = [];
  t.split(/\r?\n/).forEach((line, i) => {
    if (i === 0 && /^\W*(word|term)s?\b/i.test(line) && /meaning|definition/i.test(line)) return;
    rows.push(...parseLine(line));
  });
  return { rows };
}

function planImport(rows) {
  const seen = new Set();
  const plan = [];
  rows.forEach(r => {
    const word = cleanWord(r?.word);
    if (!word || seen.has(bankKey(word))) return;
    seen.add(bankKey(word));
    const meaning = cleanText(r.meaning);
    const example = cleanText(r.example);
    const problem = wordProblem(word);
    const have = bankEntry(word);
    const status = problem ? 'skip'
      : !have ? 'new'
      : (meaning && meaning !== have.meaning) || (example && example !== have.example) ? 'update' : 'same';
    plan.push({ word, meaning, example, status, problem });
  });
  return plan;
}

const IMPORT_STATS = { new: n => `${n} new`, update: n => `${n} updated`, same: n => `${n} already saved`, skip: n => `${n} skipped` };
const IMPORT_TAGS = { new: 'New', update: 'Update', same: 'Saved', skip: 'Skipped' };

const previewRow = p => `<li class="pv-${p.status}">
    <div><b>${esc(p.word)}</b><span>${p.problem ? esc(p.problem) : p.meaning ? esc(p.meaning) : '<i>No meaning</i>'}</span></div>
    <em>${IMPORT_TAGS[p.status]}</em>
  </li>`;

function backupNote(backup) {
  let sessions = 0;
  try { sessions = JSON.parse(backup.data?.history || '[]').length; } catch {}
  const when = new Date(backup.exported);
  const date = isNaN(when) ? '' : ` from ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `<p class="backup-note">WordWise backup${date} with ${plural((backup.words || []).length, 'word')} and ${plural(sessions, 'past session')}.
    <b>Add words</b> keeps everything you have and adds its words. <b>Restore everything</b> swaps your words, progress and settings for the backup.</p>`;
}

function showPreview({ rows, backup }, source) {
  const plan = planImport(rows);
  const box = $('#import-preview');
  if (!plan.length && !backup) {
    box.hidden = true;
    toast("Couldn't find any words in that.");
    return;
  }
  pendingImport = { plan, backup };
  const count = s => plan.filter(p => p.status === s).length;
  const fresh = count('new');
  const updates = count('update');
  const label = fresh && updates ? `Add ${fresh}, update ${updates}`
    : fresh ? `Add ${plural(fresh, 'word')}`
    : updates ? `Update ${plural(updates, 'word')}` : 'Nothing new to add';
  const shown = plan.slice(0, 100);
  box.innerHTML = `<div class="card-head">
      <h2>Check before adding</h2>
      <p class="muted small">From ${esc(source)}</p>
    </div>
    ${backup ? backupNote(backup) : ''}
    <div class="import-stats">${Object.keys(IMPORT_STATS).filter(count).map(s => `<span class="st st-${s}">${IMPORT_STATS[s](count(s))}</span>`).join('')}</div>
    <ul class="preview-list">${shown.map(previewRow).join('')}</ul>
    ${plan.length > shown.length ? `<p class="muted small more">and ${plural(plan.length - shown.length, 'more word')}</p>` : ''}
    <div class="add-actions">
      <button class="btn ghost" type="button" data-import="cancel">Cancel</button>
      ${backup ? '<button class="btn ghost" type="button" data-import="restore">Restore everything</button>' : ''}
      <button class="btn" type="button" data-import="apply"${fresh + updates ? '' : ' disabled'}>${label}</button>
    </div>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyImport() {
  let added = 0;
  let updated = 0;
  pendingImport.plan.forEach(p => {
    const have = bankEntry(p.word);
    if (p.status === 'new' && !have) {
      bank.push({ word: p.word, meaning: p.meaning, example: p.example });
      added++;
    } else if (p.status === 'update' && have) {
      if (p.meaning) have.meaning = p.meaning;
      if (p.example) have.example = p.example;
      updated++;
    }
  });
  saveBank();
  closePreview();
  $('#import-text').value = '';
  renderLists();
  showPane('bank');
  toast([added && `Added ${plural(added, 'word')}`, updated && `updated ${updated}`].filter(Boolean).join(', ') || 'Nothing changed');
}

function restoreBackup(backup) {
  if (!confirm('Replace your words, progress and settings with this backup? What you have now will be lost.')) return;
  ['history', 'mistakes', 'recent'].forEach(k => localStorage.removeItem(k));
  Object.entries(backup.data || {}).forEach(([k, v]) => {
    if (k !== AUTH_KEY && typeof v === 'string') localStorage.setItem(k, v);
  });
  store.set('wordBank', (backup.words || [])
    .map(w => ({ word: cleanWord(w?.word), meaning: cleanText(w?.meaning), example: cleanText(w?.example) }))
    .filter(w => !wordProblem(w.word)));
  location.reload();
}

function closePreview() {
  pendingImport = null;
  $('#import-preview').hidden = true;
}

$('#import-preview').addEventListener('click', e => {
  const b = e.target.closest('[data-import]');
  if (!b || !pendingImport) return;
  if (b.dataset.import === 'apply') applyImport();
  else if (b.dataset.import === 'restore') restoreBackup(pendingImport.backup);
  else closePreview();
});

$('#import-file').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    showPreview(readImport(String(reader.result || '')), file.name);
    e.target.value = '';
  };
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsText(file);
});

$('#import-preview-btn').addEventListener('click', () => {
  if (!$('#import-text').value.trim()) {
    toast('Paste some words first, or choose a file.');
    $('#import-text').focus();
    return;
  }
  showPreview(readImport($('#import-text').value), 'what you pasted');
});

/* Export */

const today = () => new Date().toISOString().slice(0, 10);
const csvCell = s => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function bankLines() {
  return bank.map(b => {
    const parts = [b.word, b.meaning || '', b.example || ''];
    while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
    return parts.join(' | ');
  });
}

function backupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== AUTH_KEY && k !== 'wordBank') data[k] = localStorage.getItem(k);
  }
  return { app: 'WordWise', version: 1, exported: new Date().toISOString(), words: bank, data };
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$$('[data-export]').forEach(b => b.addEventListener('click', () => {
  const kind = b.dataset.export;
  if (kind !== 'backup' && !bank.length) {
    toast('Your word bank is empty. Add some words first.');
    return;
  }
  if (kind === 'txt') download(`wordwise-words-${today()}.txt`, `${bankLines().join('\n')}\n`, 'text/plain');
  if (kind === 'csv') {
    const rows = bank.map(x => [x.word, x.meaning || '', x.example || ''].map(csvCell).join(','));
    download(`wordwise-words-${today()}.csv`, `\uFEFF${['word,meaning,example', ...rows].join('\r\n')}\r\n`, 'text/csv');
  }
  if (kind === 'backup') download(`wordwise-backup-${today()}.json`, JSON.stringify(backupData(), null, 1), 'application/json');
  toast('Saved to your downloads.');
}));

$('#copy-bank').addEventListener('click', async () => {
  if (!bank.length) {
    toast('Your word bank is empty. Add some words first.');
    return;
  }
  try {
    await navigator.clipboard.writeText(bankLines().join('\n'));
    toast(`Copied ${plural(bank.length, 'word')}.`);
  } catch {
    toast('Copy did not work in this browser.');
  }
});

/* ---------- Dictation session ---------- */

const finePointer = matchMedia('(pointer: fine)').matches;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four'];
const MAX_TYPED = 40;
const BACKSPACE_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="m17 9-6 6M11 9l6 6"/></svg>';

const tile = (letter, cls = '') => `<b${cls ? ` class="${cls}"` : ''}>${letter === ' ' ? '&nbsp;' : esc(letter)}</b>`;

// Gboard layout on a 20-column grid: letters span 2 columns, so the middle row can sit half a key in.
const letterKeys = row => [...row].map(k => `<button class="k pop" type="button" data-key="${k}">${k}</button>`).join('');
$('#kb-keys').innerHTML = `
  <div class="kb-row">${letterKeys('qwertyuiop')}</div>
  <div class="kb-row indent">${letterKeys('asdfghjkl')}</div>
  <div class="kb-row">
    <button class="k fn wide pop" type="button" data-key="'" aria-label="Apostrophe">'</button>${letterKeys('zxcvbnm')}<button class="k fn wide" type="button" data-key="Backspace" aria-label="Delete letter">${BACKSPACE_ICON}</button>
  </div>
  <div class="kb-row">
    <button class="k fn wide pop" type="button" data-key="-" aria-label="Hyphen">-</button>
    <button class="k space" type="button" data-key=" " aria-label="Space"></button>
    <button id="check" class="k go" type="button">Check</button>
  </div>`;

function openPlay(id) {
  $('#session').hidden = id !== 'session';
  $('#summary').hidden = id !== 'summary';
  document.body.classList.toggle('in-play', Boolean(id));
  closePopovers();
  if (!id) exitFullscreen();
}

const setState = state => { $('#session').dataset.state = state; };

function startSession(words, label) {
  Object.assign(session, { words, index: 0, results: [], label, started: Date.now() });
  $('#session-list').textContent = label;
  openPlay('session');
  if (store.get('fullscreen', true)) enterFullscreen();
  if (soundPrefs().keyMode === 'say') loadLetterClips();
  sound('start');
  showWord();
}

/* ---------- Full screen ---------- */

// iPhone Safari only allows full screen for videos, so these report false there.
function fullscreenSupported() {
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function enterFullscreen() {
  if (!fullscreenSupported() || isFullscreen()) return;
  const root = document.documentElement;
  try {
    const req = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen();
    req?.catch?.(() => {});
  } catch {}
}

function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    const req = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
    req?.catch?.(() => {});
  } catch {}
}

function renderFullscreen() {
  const on = isFullscreen();
  const b = $('#fs-toggle');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  b.title = on ? 'Exit full screen' : 'Full screen';
}

$('#fs-toggle').hidden = !fullscreenSupported();
$('#fs-toggle').addEventListener('click', () => (isFullscreen() ? exitFullscreen() : enterFullscreen()));
['fullscreenchange', 'webkitfullscreenchange'].forEach(type => document.addEventListener(type, renderFullscreen));
localStorage.removeItem('fsHints');
$('#fs-on').addEventListener('change', e => store.set('fullscreen', e.target.checked));

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
  $('#typed').innerHTML = letters.map(l => tile(l, l === ' ' ? 'sp' : '')).join('') + '<b class="caret"></b>';
  if (!session.checked) setState(letters.length ? 'typing' : 'listen');
}

function typeKey(key) {
  if (session.checked) return;
  if (key === ' ' && (!session.typed || session.typed.endsWith(' '))) return;
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
  session.askedAt = Date.now();
  renderTyped();
  setTimeout(() => { if (current() === word && !session.checked) speak(word); }, 300);
  updateHints(word);
  const upcoming = session.words[session.index + 1];
  if (upcoming) lookup(upcoming).catch(() => {});
}

// Sentence and Meaning only show when there is something for them to read.
async function updateHints(word) {
  const mine = bankEntry(word);
  const show = (meaning, example) => {
    if (current() !== word) return;
    $('#play-meaning').hidden = !meaning;
    $('#play-sentence').hidden = !example;
  };
  show(Boolean(mine?.meaning), Boolean(mine?.example));
  if (mine?.meaning && mine?.example) return;
  try {
    const defs = await examplesFor(word);
    show(Boolean(mine?.meaning || defs.length), Boolean(mine?.example || defs.some(d => d.example)));
  } catch {}
}

const keys = $('#kb-keys');
let pressedKey = null;
let repeatTimer = 0;

// Keys never take focus, so a physical Enter or Space can't re-press the last tapped key.
$('.kb').addEventListener('mousedown', e => e.preventDefault());

// Letters type the moment a finger lands. Waiting for the click loses letters when typing
// fast with two thumbs, because the browser drops a click if another finger touched meanwhile.
keys.addEventListener('pointerdown', e => {
  const key = e.target.closest('[data-key]');
  if (!key) return;
  pressedKey?.classList.remove('down');
  pressedKey = key;
  key.classList.add('down');
  keyFeedback(key.dataset.key);
  typeKey(key.dataset.key);
  if (key.dataset.key === 'Backspace') {
    clearTimeout(repeatTimer);
    clearInterval(repeatTimer);
    repeatTimer = setTimeout(() => { repeatTimer = setInterval(() => typeKey('Backspace'), 70); }, 450);
  }
});

const releaseKey = () => {
  clearTimeout(repeatTimer);
  clearInterval(repeatTimer);
  const key = pressedKey;
  pressedKey = null;
  if (key) setTimeout(() => key.classList.remove('down'), 80);
};
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => keys.addEventListener(type, releaseKey));

keys.addEventListener('click', e => {
  const key = e.target.closest('[data-key]');
  // Taps already typed on pointerdown; this only handles clicks with no pointer, like a screen reader.
  if (!key || e.detail) return;
  typeKey(key.dataset.key);
});
$('#check').addEventListener('click', checkAnswer);

// Reads back what you typed, letter by letter, without lighting up the Again button.
$('#read-typed').addEventListener('mousedown', e => e.preventDefault());
$('#read-typed').addEventListener('click', () => {
  if (!canSpeak || !session.typed) return;
  setSpeaking(false);
  utter([...session.typed].map(c => KEY_NAMES[c] || c.toUpperCase()).join(', '), spellRate(), ++speakId);
});

// A physical keyboard (computer or tablet) types into the same tiles.
document.addEventListener('keydown', e => {
  if ($('#session').hidden || !$('#sheet-wrap').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target : document.body;
  if (el.closest('input, select, textarea')) return;
  const asking = !session.checked;
  if (asking && /^[a-z' -]$/i.test(e.key)) {
    typeKey(e.key.toLowerCase());
    if (soundPrefs().keyMode === 'say' && !e.repeat) sayKey(e.key.toLowerCase());
  } else if (asking && e.key === 'Backspace') typeKey('Backspace');
  else if (e.key === 'Enter' && !el.closest('button')) {
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
  const mine = bankEntry(word)?.example;
  if (mine) return speak(`${word}. ${mine.replace(/[.!?]+$/, '')}. ${word}.`);
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
  const mine = bankEntry(word)?.meaning;
  if (mine) return speak(`It means: ${mine}`);
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
$('#play-slow').addEventListener('click', () => speak(current(), slowRate()));
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
  const meanings = all.flatMap(e => e.meanings || []);
  const defs = meanings.flatMap(m => (m.definitions || []).map(d => ({ ...d, meaning: m })));
  const main = defs.find(d => !isLabelled(d)) || defs[0];
  const example = [main, ...defs].map(d => d?.example).find(x => x && x.length <= 120) || '';
  const similar = main
    ? [...new Set([...(main.synonyms || []), ...(main.meaning.synonyms || [])])].filter(w => !/\s/.test(w)).slice(0, 4)
    : [];
  return { phonetic, def: main?.definition || '', example, pos: main?.meaning.partOfSpeech || '', similar };
}

const inARow = () => {
  let n = 0;
  for (let i = session.results.length - 1; i >= 0 && session.results[i].correct; i--) n++;
  return n;
};

const PRAISE = ['Correct', 'Spot on', 'Nailed it', 'Well spelled', 'Exactly right', 'Brilliant'];
const isMilestone = run => run === 3 || (run >= 5 && run % 5 === 0);
let lastPraise = '';

function praiseFor(run) {
  if (run === 3) return 'Hat trick!';
  if (isMilestone(run)) return `${run} in a row!`;
  const options = PRAISE.filter(p => p !== lastPraise);
  lastPraise = options[Math.floor(Math.random() * options.length)];
  return lastPraise;
}

const formatSecs = s => (s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`);

function showCorrect(word, secs) {
  setState('ok');
  const run = inARow();
  const right = session.results.filter(r => r.correct).length;
  $('#ok-title').textContent = praiseFor(run);
  $('#ok-sub').textContent = `Spelled in ${formatSecs(secs)}, ${right} of ${session.results.length} right so far`;
  $('#in-a-row').hidden = run < 2;
  $('#in-a-row').classList.toggle('hot', isMilestone(run));
  $('#in-a-row span').textContent = `${run} in a row`;

  const burst = $('#ok-burst');
  burst.classList.remove('go');
  void burst.offsetWidth;
  burst.classList.add('go');

  $('#ok-word').innerHTML = `${esc(word)}<button class="say say-big" type="button" data-speak="${esc(word)}" aria-label="Say the word" title="Say the word">${SPEAKER_ICON}</button>`;
  $('#ok-tiles').classList.toggle('long', word.length > 11);
  $('#ok-tiles').innerHTML = [...word].map((l, i) => `<b class="good" style="--i:${i}">${l === ' ' ? '&nbsp;' : esc(l)}</b>`).join('');
  $('#ok-phon').innerHTML = `<button class="chip" type="button" data-sheet-word="${esc(word)}">Meaning</button>`;
  $('#ok-pos').hidden = true;
  $('#ok-def').textContent = 'Loading meaning\u2026';
  $('.ok-meaning').hidden = false;
  $('#ok-ex').hidden = true;
  $('#ok-syn').hidden = true;
  $('.res-ok .res-body').scrollTop = 0;
  if (finePointer) $('#ok-next').focus();
}

function showWrong(word, typed) {
  setState('bad');
  $('#bad-title').textContent = typed ? 'Not quite' : 'Skipped';
  $('#bad-word').innerHTML = spoken(word);
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
  $('#bad-entry').hidden = false;
  $('.res-bad .res-body').scrollTop = 0;
  if (finePointer) $('#bad-next').focus();
}

function fillResult(word, entries, correct, failed) {
  const facts = entryFacts(entries);
  const { phonetic, similar } = facts;
  const mine = bankEntry(word);
  // A saved meaning wins, and the dictionary's part of speech may not match it.
  const def = mine?.meaning || facts.def;
  const example = mine?.example || (mine?.meaning ? '' : facts.example);
  const pos = mine?.meaning ? '' : facts.pos;
  const nothing = !entries && !def && !failed;
  if (correct) {
    if (nothing) $('#ok-phon [data-sheet-word]')?.remove();
    if (phonetic) $('#ok-phon').insertAdjacentHTML('afterbegin', `<span>${esc(phonetic)}</span>`);
    $('#ok-pos').textContent = pos;
    $('#ok-pos').hidden = !pos;
    $('#ok-def').innerHTML = def ? spoken(def) : failed ? "Couldn't load the meaning. Tap Meaning to try again." : '';
    $('#ok-ex').innerHTML = example ? spoken(`"${example}"`) : '';
    $('#ok-ex').hidden = !example;
    $('#ok-syn').innerHTML = similar.length
      ? `<span>Similar</span>${similar.map(w => `<button class="chip link" type="button" data-sheet-word="${esc(w)}">${esc(w)}</button>`).join('')}`
      : '';
    $('#ok-syn').hidden = !similar.length;
    $('.ok-meaning').hidden = !def && !failed && !similar.length;
  } else {
    $('#bad-entry').hidden = nothing;
    $('#bad-meaning').hidden = !def;
    $('#bad-def').innerHTML = def ? spoken(def) : '';
    $('#bad-ex').innerHTML = example ? spoken(`"${example}"`) : '';
    $('#bad-ex').hidden = !example;
  }
}

async function record(word, typed) {
  const correct = typed.toLowerCase() === word.toLowerCase();
  const index = session.index;
  const secs = (Date.now() - session.askedAt) / 1000;
  session.results.push({ word, typed, correct });
  session.checked = true;
  updateMistakes(word, correct);

  renderSegs();
  const last = index + 1 >= session.words.length;
  $$('.next-btn').forEach(b => (b.textContent = last ? 'See results' : 'Next word'));
  if (correct) {
    showCorrect(word, secs);
    sound(isMilestone(inARow()) ? 'streak' : 'correct');
  } else {
    showWrong(word, typed);
    sound(typed ? 'wrong' : 'skip');
    if (typed) buzz([25, 40, 25]);
  }
  if (store.get('sayAfterCheck', true)) {
    // Waits for the longest chime (the streak one) so the word never plays over it.
    const wait = soundPrefs().sfx ? 700 : 150;
    setTimeout(() => { if (session.index === index && session.checked && !$('#session').hidden) speak(word); }, wait);
  }

  let entries = null;
  let failed = false;
  try {
    entries = await lookup(word);
  } catch {
    failed = true;
  }
  if (session.index === index && session.checked) fillResult(word, entries, correct, failed);
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
  if (!e.target.closest('button')) openSheet(current());
});
$$('.enter-hint').forEach(el => (el.hidden = !finePointer));

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
  sound(pct === 100 ? 'perfect' : 'complete');
  if (done >= goal && done - results.length < goal) setTimeout(() => sound('goal'), 900);

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
    <ol class="defs">${g.defs.map(defItem).join('')}</ol>`).join('');

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
        ${examples.length ? `<ul class="ex-list">${examples.map(x => `<li class="example">${spoken(`"${x}"`)}</li>`).join('')}</ul>` : '<p class="muted">No example sentences for this word yet.</p>'}
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
  let html;
  try {
    html = sheetHtml(word, await lookup(word));
  } catch (err) {
    html = `${sheetTop(word, '')}<p class="error">Couldn't load the dictionary entry. ${esc(err.message)}</p>`;
  }
  if (sheetWord !== word) return;
  $('#sheet-body').innerHTML = html;
  const mine = bankEntry(word);
  if (mine?.meaning) {
    $('#sheet-body .sheet-top').insertAdjacentHTML('afterend', `<div class="my-meaning">
      <p class="lab">Your meaning</p>
      <p class="def">${spoken(mine.meaning)}</p>
      ${mine.example ? `<p class="example">${spoken(`"${mine.example}"`)}</p>` : ''}
    </div>`);
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
