const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'me', 'my', 'not', 'of', 'on', 'or', 'she', 'so', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when',
  'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your'
]);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

// Pages from every uploaded file, flattened into windows small enough to quote back.
export function buildChunks(pages, wordsPerChunk = 160) {
  const chunks = [];
  pages.forEach(({ page, text, file }) => {
    const words = text.split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start += wordsPerChunk) {
      const body = words.slice(start, start + wordsPerChunk).join(' ');
      if (body.trim().length < 40) continue;
      chunks.push({ id: chunks.length, page, file, text: body });
    }
  });
  return chunks;
}

function documentFrequencies(tokenLists) {
  const df = new Map();
  tokenLists.forEach((tokens) => {
    new Set(tokens).forEach((term) => df.set(term, (df.get(term) ?? 0) + 1));
  });
  return df;
}

/**
 * BM25 ranking. The prototype ranked with sentence-transformer embeddings held in a FAISS
 * index; that needs ~2 GB of torch in the runtime, which a free serverless plan cannot hold,
 * so ranking moved to the browser and became lexical. Expect it to miss paraphrases.
 */
export function rankChunks(query, chunks, { k1 = 1.5, b = 0.75, topK = 5 } = {}) {
  if (!chunks.length) return [];
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return [];

  const tokenLists = chunks.map((chunk) => tokenize(chunk.text));
  const df = documentFrequencies(tokenLists);
  const averageLength = tokenLists.reduce((sum, list) => sum + list.length, 0) / tokenLists.length;
  const total = chunks.length;

  const scored = chunks.map((chunk, index) => {
    const counts = new Map();
    tokenLists[index].forEach((term) => counts.set(term, (counts.get(term) ?? 0) + 1));
    const length = tokenLists[index].length || 1;

    let score = 0;
    queryTerms.forEach((term) => {
      const frequency = counts.get(term);
      if (!frequency) return;
      const documentCount = df.get(term) ?? 1;
      const idf = Math.log(1 + (total - documentCount + 0.5) / (documentCount + 0.5));
      score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (length / averageLength))));
    });
    return { chunk, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, topK);
}
