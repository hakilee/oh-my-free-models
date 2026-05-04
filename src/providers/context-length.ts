const CONTEXT_KEYS = [
  'context_length',
  'max_context_length',
  'contextLength',
  'maxContextLength',
  'context_window',
  'contextWindow',
  'context_size',
  'contextSize',
  'max_model_len',
  'maxModelLen',
  'input_context_length',
  'inputContextLength',
  'max_input_tokens',
  'maxInputTokens',
];

const CONTEXT_CONTAINERS = ['metadata', 'capabilities', 'model_config', 'modelConfig', 'config', 'limits'];

export function parseTokenCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const match = value.match(/([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/i);
  if (!match) return undefined;
  return parseTokenCountParts(match[1]!, match[2]);
}

export function extractContextLengthFromRecord(record: Record<string, unknown>): number | undefined {
  for (const key of CONTEXT_KEYS) {
    const contextLength = parseTokenCount(record[key]);
    if (contextLength) return contextLength;
  }

  for (const key of CONTEXT_CONTAINERS) {
    const container = record[key];
    if (!container || typeof container !== 'object') continue;
    for (const contextKey of CONTEXT_KEYS) {
      const contextLength = parseTokenCount((container as Record<string, unknown>)[contextKey]);
      if (contextLength) return contextLength;
    }
  }

  return undefined;
}

export function normalizeMetadataText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\u003[eE]/g, '>')
    .replace(/\\u003[cC]/g, '<')
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export function parseContextLengthFromText(text: string): number | undefined {
  const normalized = normalizeMetadataText(text);
  const candidates: Array<{ contextLength: number; score: number; index: number }> = [];
  const patterns: Array<{ pattern: RegExp; score: number }> = [
    {
      pattern: /(?:maximum|max|input)?\s*context\s+length(?:\s*\([^)]+\))?[^0-9]{0,80}?(?:up to|of|is|:|\|)?\s*([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?(?:\s*tokens?)?/gi,
      score: 100,
    },
    {
      pattern: /context\s+(?:window|size)[^0-9]{0,80}?(?:up to|of|is|:|\|)?\s*([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?(?:\s*tokens?)?/gi,
      score: 95,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s*[- ]?\s*tokens?\s+context\s+(?:window|length|size)s?/gi,
      score: 85,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s*tokens?\s+(?:of|for)\s+context\b/gi,
      score: 80,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s+context\b/gi,
      score: 75,
    },
  ];

  for (const { pattern, score } of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const contextLength = parseTokenCountParts(match[1]!, match[2], { rejectSmallUnitless: true });
      if (contextLength) candidates.push({ contextLength, score, index: match.index ?? 0 });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.contextLength - a.contextLength || a.index - b.index);
  return candidates[0]?.contextLength;
}

function parseTokenCountParts(
  rawNumber: string,
  rawUnit?: string,
  options: { rejectSmallUnitless?: boolean } = {},
): number | undefined {
  const number = Number(rawNumber.replace(/,/g, ''));
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const unit = rawUnit?.toLowerCase();
  if (!unit && options.rejectSmallUnitless && number < 1024) return undefined;
  const multiplier = unit === 'm' || unit === 'million' ? 1_000_000 : unit === 'k' || unit === 'thousand' ? 1_000 : 1;
  return Math.round(number * multiplier);
}
