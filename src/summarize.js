import { GoogleGenAI, Type } from '@google/genai';

// Created lazily on first use, after main.js has verified the key exists.
let ai;
function client() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

// One request summarizes ALL articles at once. The free tier allows only ~20
// requests/day PER MODEL (and ~10/min), so batching into a single call keeps us
// far inside the limits instead of spending one request per article.
// gemini-2.5-flash is a fast, capable GA model with good quality for news.
const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are a sharp financial and technology news analyst.
You will receive several numbered news articles. For EACH article, write a
concise structured analysis in markdown using EXACTLY this template:

**Summary**
- [3–5 bullets covering the key facts]

**Why It Matters**
[1–2 sentences on broader significance]

**Market Impact**
[1–2 sentences on market/investment implications, or "N/A" if not relevant]

Be analytical, precise, and direct. No preamble. Return exactly one analysis per
article, echoing back the article's index number.`;

// Force structured JSON output so we can map each summary back to its article.
const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER, description: 'The 1-based article number' },
      summary: { type: Type.STRING, description: 'The markdown analysis block' },
    },
    required: ['index', 'summary'],
  },
};

function isPerDayQuota(msg) {
  return /per[\s_-]?day|requestsperday/i.test(msg);
}

function parseJsonArray(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Defensive: strip code fences or extract the [ ... ] slice if the model
    // wrapped the JSON in prose.
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error('Could not parse Gemini JSON response');
  }
}

async function generateWithRetry(contents, config, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client().models.generateContent({ model: MODEL, contents, config });
    } catch (err) {
      const status = err?.status ?? err?.code;
      const msg = err?.message || '';
      const isQuota =
        status === 429 || /quota|rate.?limit|resource_exhausted/i.test(msg);
      const isTransient =
        status === 503 ||
        status === 500 ||
        /unavailable|overloaded|high demand|internal error/i.test(msg);

      // A per-DAY quota won't reset for hours — retrying is pointless. Fail fast
      // with a clear message instead of hanging on minute-long backoffs.
      if (isQuota && isPerDayQuota(msg)) {
        throw new Error(
          'Daily free-tier quota exhausted for this model. Try again tomorrow, ' +
            'switch MODEL in summarize.js, or enable billing in Google AI Studio.'
        );
      }
      // Per-minute limit or transient server error (503/500): wait, then retry.
      if ((isQuota || isTransient) && attempt < maxRetries) {
        const suggested = msg.match(/retry in ([\d.]+)s/i);
        const waitMs = Math.min(
          suggested ? (parseFloat(suggested[1]) + 1) * 1000 : 5000 * (attempt + 1),
          65000
        );
        console.log(`  (retrying in ${Math.round(waitMs / 1000)}s — ${status || 'rate limit'})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

// gemini-2.5-* models "think" by default, which consumes the output-token budget
// and can truncate the JSON. Structured summarization doesn't need it, so we turn
// thinking off to keep the full answer intact.
const GEN_CONFIG = {
  systemInstruction: SYSTEM_PROMPT,
  temperature: 0.4,
  maxOutputTokens: 16384,
  thinkingConfig: { thinkingBudget: 0 },
  responseMimeType: 'application/json',
  responseSchema: RESPONSE_SCHEMA,
};

// Articles per request. Cramming too many into one call can return a truncated
// JSON (some get dropped), so we summarize in reliably-sized chunks. A handful of
// chunks per run still stays far inside the free-tier limits.
const CHUNK_SIZE = 6;

// Summarize every article, in chunks of CHUNK_SIZE. Returns an array of markdown
// strings aligned to the input order; anything the model omits — or a whole
// failed chunk — falls back to a graceful placeholder.
export async function summarizeAll(articles) {
  const PLACEHOLDER = '_Summary unavailable._';
  const summaries = new Array(articles.length).fill(PLACEHOLDER);

  for (let start = 0; start < articles.length; start += CHUNK_SIZE) {
    const chunk = articles.slice(start, start + CHUNK_SIZE);
    const prompt = chunk
      .map((a, i) =>
        [
          `### Article ${i + 1}`,
          `Title: ${a.title}`,
          `Source: ${a.source}`,
          `Content: ${a.content}`,
          `URL: ${a.link}`,
        ].join('\n')
      )
      .join('\n\n');

    try {
      const response = await generateWithRetry(prompt, GEN_CONFIG);
      const text = (response.text || '').trim();
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = parseJsonArray(text);

      const byIndex = new Map();
      for (const item of parsed) {
        if (item && typeof item.index === 'number' && item.summary) {
          byIndex.set(item.index, String(item.summary).trim());
        }
      }
      chunk.forEach((_, i) => {
        const s = byIndex.get(i + 1);
        if (s) summaries[start + i] = s;
      });
    } catch (err) {
      // One bad chunk shouldn't sink the whole digest — keep the rest.
      console.error(`  ✗ articles ${start + 1}-${start + chunk.length}: ${err.message}`);
    }
  }

  return summaries;
}
