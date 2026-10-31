// Makes the Piper voice for your own words off the main thread, so typing and tapping stay smooth.
const LIB = 'https://cdn.jsdelivr.net/npm/';
const PHONEMIZE = `${LIB}@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize`;
const MODELS = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';
const MODEL_CACHE = 'wordwise-voice-models';
// Piper reads a word on its own faster than a person dictating would, so single words are
// stretched a little more than sentences. Slow matches the built-in slow recordings (55% speed).
const WORD = 1.3;
const LINE = 1.1;
const SLOW = 1.8;
// Phones often clip the first moment of a sound, so each clip starts and ends with a short silence.
const LEAD = 0.15;
const TAIL = 0.2;
// Southern English garbles a word said on its own ("move" came out like "the") but says it clearly
// at the end of a phrase. Its copy of the model, served from here, also reports how many frames
// each sound lasts, so the word can be cut back out of the phrase. It's steadier with less noise.
const PHRASE_VOICES = {
  'en_GB-southern_english_female-low': { model: 'voices/en_GB-southern_english_female-low.onnx', noise: 0.333 },
};
const LEAD_IN = 'Now say';
// Frames kept from before the word so its first sound isn't clipped. More than this picks up "say".
const CUT_EARLY = 5;

let engine = null;
let engineVoice = '';
let queue = Promise.resolve();

// en_GB-alba-medium lives at en/en_GB/alba/medium/en_GB-alba-medium.onnx
function modelPath(voice) {
  const [lang, speaker, quality] = voice.split('-');
  return `${lang.split('_')[0]}/${lang}/${speaker}/${quality}/${voice}.onnx`;
}

async function download(url, onProgress) {
  const cache = await caches.open(MODEL_CACHE).catch(() => null);
  const hit = cache && (await cache.match(url));
  if (hit) return hit.blob();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The voice download failed (${res.status}).`);
  const total = +res.headers.get('Content-Length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) onProgress(loaded, total);
  }
  const blob = new Blob(chunks);
  if (cache) await cache.put(url, new Response(blob)).catch(() => {});
  return blob;
}

async function load(voice) {
  const [{ createPiperPhonemize }, ort] = await Promise.all([
    import(`${LIB}@mintplex-labs/piper-tts-web@1.0.4/dist/piper-o91UDS6e.js/+esm`),
    import(`${LIB}onnxruntime-web@1.18.0/+esm`),
  ]);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${LIB}onnxruntime-web@1.18.0/dist/`;
  const path = MODELS + modelPath(voice);
  const config = JSON.parse(await (await download(`${path}.json`)).text());
  const own = PHRASE_VOICES[voice]?.model;
  const model = await download(own ? new URL(own, location).href : path, (loaded, total) => postMessage({ type: 'progress', loaded, total }));
  const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()));
  return { ort, createPiperPhonemize, config, session };
}

async function phonemeIds({ createPiperPhonemize, config }, text) {
  let ids = null;
  let problem = '';
  const module = await createPiperPhonemize({
    print: data => { ids = JSON.parse(data).phoneme_ids; },
    printErr: message => { problem = message; },
    locateFile: url => (url.endsWith('.wasm') ? `${PHONEMIZE}.wasm` : url.endsWith('.data') ? `${PHONEMIZE}.data` : url),
  });
  module.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  if (!ids) throw new Error(problem || "Couldn't read that text.");
  return ids;
}

// Piper speaks quietly, so each line is raised to about the loudness of the built-in recordings.
function wav(samples, rate) {
  let peak = 0;
  let sum = 0;
  let voiced = 0;
  for (const v of samples) {
    peak = Math.max(peak, Math.abs(v));
    if (Math.abs(v) > 0.01) {
      sum += v * v;
      voiced++;
    }
  }
  const rms = voiced ? Math.sqrt(sum / voiced) : 0;
  const gain = rms ? Math.min(0.15 / rms, 0.95 / peak) : 1;
  const lead = Math.round(LEAD * rate);
  const padded = new Float32Array(lead + samples.length + Math.round(TAIL * rate));
  padded.set(samples, lead);
  samples = padded;
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v * gain)) * 0x7fff, true));
  return view.buffer;
}

async function make({ voice, text, slow }) {
  if (!engine || engineVoice !== voice) {
    engineVoice = voice;
    engine = load(voice);
    engine.catch(() => { engine = null; });
  }
  const e = await engine;
  const single = !/\s/.test(text.trim());
  const phrase = single && PHRASE_VOICES[voice] && e.session.outputNames.includes('durations') ? PHRASE_VOICES[voice] : null;
  const ids = await phonemeIds(e, phrase ? `${LEAD_IN} ${text.trim()}.` : text);
  const { noise_scale, length_scale, noise_w } = e.config.inference;
  const feeds = {
    input: new e.ort.Tensor('int64', ids, [1, ids.length]),
    input_lengths: new e.ort.Tensor('int64', [ids.length]),
    scales: new e.ort.Tensor('float32', [phrase?.noise ?? noise_scale, length_scale * (slow ? SLOW : single ? WORD : LINE), phrase?.noise ?? noise_w]),
  };
  if (Object.keys(e.config.speaker_id_map || {}).length) feeds.sid = new e.ort.Tensor('int64', [0]);
  const { output, durations } = await e.session.run(feeds);
  let samples = output.data;
  if (phrase) {
    // The word starts just after the space that follows the lead-in (each sound is followed by a pad).
    const space = e.config.phoneme_id_map[' '][0];
    const spaces = ids.flatMap((id, i) => (id === space ? [i] : []));
    const first = spaces[LEAD_IN.split(' ').length - 1] + 2;
    const frames = Array.from(durations.data);
    const hop = samples.length / frames.reduce((a, b) => a + b, 0);
    const start = frames.slice(0, first).reduce((a, b) => a + b, 0) - CUT_EARLY;
    samples = samples.slice(Math.max(0, Math.round(start * hop)));
  }
  return wav(samples, e.config.audio.sample_rate);
}

// One line at a time: the model can't run two at once.
onmessage = ({ data }) => {
  queue = queue.then(() => make(data)
    .then(audio => postMessage({ type: 'done', id: data.id, audio }, [audio]))
    .catch(err => postMessage({ type: 'error', id: data.id, message: String((err && err.message) || err) })));
};
