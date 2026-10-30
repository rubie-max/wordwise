"""Builds the offline dictionary (dict/a.json ... dict/z.json) and the Discover lists (discover.json).

Words, meanings, examples, synonyms and antonyms come from Open English WordNet 2024 (CC BY 4.0,
https://en-word.net/). Levels come from how common each word is in real English (wordfreq).

    pip install wn wordfreq
    python tools/build_words.py
"""
import json
import random
import re
from pathlib import Path

import wn
from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
POS = {'n': 'n', 'v': 'v', 'a': 'a', 's': 'a', 'r': 'r'}
HEADWORD = re.compile(r'^[a-z]+(-[a-z]+)?$')
PRACTICE = re.compile(r'^[a-z]{4,}$')
RUDE = re.compile(r'\b(offensive|obscene|vulgar|slur|derogatory|disparaging|taboo)\b')
SHORT_FOR = re.compile(r'\b(abbreviation|short for|acronym)\b')
# Rare chemicals, minerals, animals and plants aren't spelling practice, they're trivia.
TRIVIA = {'noun.substance', 'noun.animal', 'noun.plant'}
MAX_SENSES = 12
# Word counts don't tell "tammy" the fabric from Tammy the name, so nouns that are also first
# names (https://github.com/dominictarr/random-name) drop one level.
NAMES = {l.strip().lower() for l in (Path(__file__).parent / 'first-names.txt').read_text(encoding='utf-8').splitlines() if l.strip()}
LEVELS = ['easy', 'medium', 'hard', 'expert']
# WordNet rarely labels swearing or slurs, so the quizzes also skip the LDNOOBW list
# (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) and these.
BLOCKED = {l.strip().lower() for l in (Path(__file__).parent / 'blocked-words.txt').read_text(encoding='utf-8-sig').splitlines() if l.strip()}
BLOCKED |= {'gypsy', 'gyp', 'retard', 'retarded', 'spaz', 'midget', 'homo', 'cripple', 'sodomite', 'fatso',
            'pimp', 'piss', 'pervert', 'wanker', 'negress', 'darky', 'honky', 'wetback', 'dago', 'kike', 'gook',
            'aborigine', 'squirter'}
# Shown on the Discover card to give a feel for each level, so they're kept out of the quizzes.
SAMPLES = {
    'easy': ['climate', 'quality', 'governor'],
    'medium': ['volcano', 'intrinsic', 'knowledgeable'],
    'hard': ['threadbare', 'scythe', 'torpor'],
    'expert': ['pugnacious', 'haberdashery', 'nincompoop'],
}


def main():
    try:
        en = wn.Wordnet('oewn:2024')
    except wn.Error:
        wn.download('oewn:2024')
        en = wn.Wordnet('oewn:2024')

    words = {}
    # "berlin" the carriage is counted with Berlin the city, so these drop a level like names do.
    proper = set()
    for w in en.words():
        lemma = w.lemma()
        if lemma[:1].isupper():
            proper.add(lemma.lower())
        if not HEADWORD.match(lemma):
            continue
        e = words.setdefault(lemma, {'senses': [], 'rude': False, 'short': True, 'trivia': True, 'noun': True})
        stem = lemma.split('-')[0]
        for s in w.senses():
            ss = s.synset()
            d = (ss.definition() or '').strip()
            e['rude'] |= bool(RUDE.search(d))
            e['short'] &= bool(SHORT_FOR.search(d))
            e['trivia'] &= ss.lexfile() in TRIVIA
            e['noun'] &= w.pos == 'n'
            x = next((x.strip().strip('"') for x in ss.examples() if stem in x.lower()), '')
            syn = [l for l in ss.lemmas() if l != lemma and HEADWORD.match(l)][:6]
            ant = [a.word().lemma() for a in s.get_related('antonym')][:4]
            sense = [POS[w.pos], d, x, syn, ant]
            while sense[-1] in ('', []):
                sense.pop()
            e['senses'].append(sense)

    by_letter = {}
    for lemma, e in sorted(words.items()):
        by_letter.setdefault(lemma[0], {})[lemma] = e['senses'][:MAX_SENSES]
    out = ROOT / 'dict'
    out.mkdir(exist_ok=True)
    for letter, entries in by_letter.items():
        (out / f'{letter}.json').write_text(json.dumps(entries, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')

    samples = {w for ws in SAMPLES.values() for w in ws}
    levels = {'easy': [], 'medium': [], 'hard': [], 'expert': []}
    for lemma, e in words.items():
        if not PRACTICE.match(lemma) or e['rude'] or e['short'] or lemma in samples or lemma in BLOCKED:
            continue
        z = zipf_frequency(lemma, 'en')
        if z < 1.7 or (e['trivia'] and z < 3):
            continue
        # Plurals like "majors" sit beside their singular.
        if e['noun'] and lemma.endswith('s') and lemma[:-1] in words:
            continue
        if z >= 4.3:
            level = 'easy' if len(lemma) <= 8 else 'medium'
        elif z >= 3.3:
            level = 'medium'
        elif z >= 2.3:
            level = 'hard'
        else:
            level = 'expert'
        if (e['noun'] and lemma in NAMES) or lemma in proper:
            level = LEVELS[min(LEVELS.index(level) + 1, len(LEVELS) - 1)]
        levels[level].append(lemma)

    rng = random.Random(2026)
    for ws in levels.values():
        ws.sort()
        rng.shuffle(ws)
    (ROOT / 'discover.json').write_text(json.dumps(levels, separators=(',', ':')), encoding='utf-8')
    print({k: len(v) for k, v in levels.items()}, 'headwords', len(words))


if __name__ == '__main__':
    main()
