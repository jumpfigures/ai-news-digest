import { GoogleGenAI, Type } from '@google/genai';

// Created lazily on first use, after main.js has verified the key exists.
let ai;
function client() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

const MODEL = 'gemini-2.5-flash';
const PLACEHOLDER = '_Summary unavailable._';

// Bloomberg-style news categories. Gemini classifies each article into one.
export const CATEGORIES = [
  'Markets',
  'Economy',
  'Politics',
  'Technology',
  'Crypto',
  'Business',
  'World',
];

const SYSTEM_PROMPT = `You are a sharp financial and technology news analyst.
You will receive several numbered news articles. For EACH article:

1. Classify it into EXACTLY ONE category from this list:
   Markets, Economy, Politics, Technology, Crypto, Business, World.
   (Markets = stocks/bonds/commodities/trading; Economy = macro/inflation/rates/
   central banks/jobs/trade; Politics = government/policy/elections/geopolitics/war;
   Technology = tech/AI/software/startups; Crypto = crypto/blockchain/digital assets;
   Business = companies/deals/M&A/earnings; World = anything else.)

2. Write a concise structured analysis in markdown using EXACTLY this template:

**Summary**
- [3–5 bullets covering the key facts]

**Why It Matters**
[1–2 sentences on broader significance]

**Market Impact**
- [2–4 short bullets on the realistic, plausible market implications: which sectors,
assets, companies, rates, or commodities could move and in which direction — note
upside AND downside where relevant. Stay grounded and proportional; if the likely
impact is small, indirect, or uncertain, say so honestly. Never write "N/A" and do
NOT exaggerate or hype.]

Be analytical, precise, and direct. No preamble. Return exactly one entry per
article, echoing back the article's index number.`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER, description: 'The 1-based article number' },
      category: { type: Type.STRING, enum: CATEGORIES, description: 'Best-fit category' },
      summary: { type: Type.STRING, description: 'The markdown analysis block' },
    },
    required: ['index', 'category', 'summary'],
  },
};

const GEN_CONFIG = {
  systemInstruction: SYSTEM_PROMPT,
  temperature: 0.4,
  maxOutputTokens: 16384,
  // gemini-2.5-* models "think" by default, eating the output-token budget and
  // truncating the JSON. We don't need it here, so turn thinking off.
  thinkingConfig: { thinkingBudget: 0 },
  responseMimeType: 'application/json',
  responseSchema: RESPONSE_SCHEMA,
};

// Articles per request. Cramming too many into one call can return a truncated
// JSON (some get dropped), so we summarize in reliably-sized chunks.
const CHUNK_SIZE = 6;

function isPerDayQuota(msg) {
  return /per[\s_-]?day|requestsperday/i.test(msg);
}

function parseJsonArray(text) {
  try {
    return JSON.parse(text);
  } catch {
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

      // A per-DAY quota won't reset for hours — fail fast instead of hanging.
      if (isQuota && isPerDayQuota(msg)) {
        throw new Error(
          'Daily free-tier quota exhausted for this model. Try again tomorrow, ' +
            'switch MODEL in summarize.js, or enable billing in Google AI Studio.'
        );
      }
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

// Summarize + categorize every article, in chunks of CHUNK_SIZE. Returns an
// array of { summary, category } aligned to the input order; anything the model
// omits — or a failed chunk — falls back to a graceful placeholder.
export async function summarizeAll(articles) {
  const out = articles.map(() => ({ summary: PLACEHOLDER, category: 'World' }));

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
          byIndex.set(item.index, {
            summary: String(item.summary).trim(),
            category: CATEGORIES.includes(item.category) ? item.category : 'World',
          });
        }
      }
      chunk.forEach((_, i) => {
        const item = byIndex.get(i + 1);
        if (item) out[start + i] = item;
      });
    } catch (err) {
      // One bad chunk shouldn't sink the whole digest — keep the rest.
      console.error(`  ✗ articles ${start + 1}-${start + chunk.length}: ${err.message}`);
    }
  }

  return out;
}
