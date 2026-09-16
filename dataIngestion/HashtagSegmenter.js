const fs = require('fs');
const readline = require('readline');

class HashtagSegmenter {
  constructor({ groqApiKey, groqModel = 'llama-3.1-8b-instant' } = {}) {
    this.wordCost = new Map();
    this.maxWordLen = 0;
    this.groqApiKey = groqApiKey;
    this.groqModel = groqModel;

    // Tuning constants — internal only, not exposed per-call
    this.RELATIVE_THRESHOLD = 0.12;
    this.BEAM_WIDTH = 8;

    // Cache to avoid recomputation / repeated Groq calls on repeated hashtags
    this.cache = new Map();
  }

  // ================= Dictionary loading =================
  async loadDictionary(filePath) {
    const words = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const w = line.trim().toLowerCase();
      if (w) words.push(w);
    }
    const n = words.length;
    words.forEach((word, i) => {
      const cost = Math.log((i + 1) * Math.log(n));
      this.wordCost.set(word, cost);
      this.maxWordLen = Math.max(this.maxWordLen, word.length);
    });
  }

  async loadProtectedWords(filePath, priorityRank = 50) {
    const words = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const w = line.trim().toLowerCase();
      if (w) words.push(w);
    }
    words.forEach(w => this.addProtectedWord(w, priorityRank));
  }

  addProtectedWord(word, priorityRank = 1) {
    const n = this.wordCost.size || 100000;
    const cost = Math.log(priorityRank * Math.log(n));
    this.wordCost.set(word.toLowerCase(), cost);
    this.maxWordLen = Math.max(this.maxWordLen, word.length);
  }

  costOf(word) {
    if (this.wordCost.has(word)) return this.wordCost.get(word);
    if (word.length >= 2 && word.length <= 6) return 15; // plausible acronym/name
    return 9e9 / (word.length * word.length);
  }

  // ================= LAYER 1: camelCase / separator split =================
  _layer1Split(hashtagRaw) {
    const stripped = hashtagRaw.replace(/^#/, '');
    let text = stripped;

    text = text.replace(/[_\-]+/g, ' ');
    text = text.replace(/([a-zA-Z])(\d)/g, '$1 $2');
    text = text.replace(/(\d)([a-zA-Z])/g, '$1 $2');
    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    text = text.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    const parts = text.split(/\s+/).map(s => s.trim()).filter(Boolean);

    // A real structural split only counts if we ended up with more than
    // one token AND the split wasn't just a no-op on a single word.
    const didSplit = parts.length > 1;

    return { didSplit, result: parts.join(' ').toLowerCase() };
  }

  // ================= LAYER 2: DP segmentation (wordsninja-style) =================
  _segmentTopN(cleanText) {
    const len = cleanText.length;
    const dp = new Array(len + 1);
    dp[0] = [{ cost: 0, words: [] }];

    for (let i = 1; i <= len; i++) {
      const candidates = [];
      const start = Math.max(0, i - this.maxWordLen);
      for (let j = start; j < i; j++) {
        const word = cleanText.slice(j, i);
        const wcost = this.costOf(word);
        for (const prev of dp[j]) {
          candidates.push({ cost: prev.cost + wcost, words: [...prev.words, word] });
        }
      }
      candidates.sort((a, b) => a.cost - b.cost);

      const seen = new Set();
      const deduped = [];
      for (const c of candidates) {
        const key = c.words.join(' ');
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(c);
        }
        if (deduped.length >= this.BEAM_WIDTH) break;
      }
      dp[i] = deduped;
    }

    return dp[len] || [];
  }

  _layer2Segment(hashtagRaw) {
    const clean = hashtagRaw.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return { confident: false, result: hashtagRaw };

    const candidates = this._segmentTopN(clean);
    if (candidates.length === 0) return { confident: false, result: hashtagRaw };

    if (candidates.length === 1) {
      return { confident: true, result: candidates[0].words.join(' ') };
    }

    const [best, second] = candidates;
    const gap = second.cost - best.cost;
    const relativeGap = best.cost > 0 ? gap / best.cost : gap;

    if (relativeGap < this.RELATIVE_THRESHOLD) {
      return { confident: false, result: hashtagRaw };
    }
    return { confident: true, result: best.words.join(' ') };
  }

  // ================= LAYER 3: Groq API fallback =================
  async _layer3GroqSegment(hashtagRaw) {
    if (!this.groqApiKey) {
      console.warn('No Groq API key set — skipping Layer 3, returning original hashtag.');
      return hashtagRaw;
    }

    const prompt = `Split this hashtag into readable words and give only the core subject/topic (drop filler words like "justice for", "save", "boycott", "support"). Handle Hindi/Hinglish transliteration if present. Respond with ONLY the final phrase, nothing else, no punctuation, no explanation.

Hashtag: ${hashtagRaw}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.groqApiKey}`,
        },
        body: JSON.stringify({
          model: this.groqModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 50,
        }),
      });

      if (!response.ok) {
        console.error('Groq API error:', response.status, await response.text());
        return hashtagRaw;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      return text || hashtagRaw;
    } catch (err) {
      console.error('Groq API call failed:', err.message);
      return hashtagRaw; // always fail safe
    }
  }

  // ================= MAIN ENTRY POINT =================
  // Takes ONLY the hashtag string. Returns the segmented phrase,
  // or the original hashtag if nothing could be confidently resolved.
  async segmentHashtag(hashtagRaw) {
    if (typeof hashtagRaw !== 'string' || !hashtagRaw.trim()) {
      return hashtagRaw;
    }

    if (this.cache.has(hashtagRaw)) {
      return this.cache.get(hashtagRaw);
    }

    let result;

    const layer1 = this._layer1Split(hashtagRaw);
    if (layer1.didSplit) {
      result = layer1.result;
    } else {
      const layer2 = this._layer2Segment(hashtagRaw);
      if (layer2.confident) {
        result = layer2.result;
      } else {
        result = await this._layer3GroqSegment(hashtagRaw);
      }
    }

    this.cache.set(hashtagRaw, result);
    return result;
  }
}

module.exports = HashtagSegmenter;
