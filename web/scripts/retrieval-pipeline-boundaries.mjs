const FILTER_KEYS = Object.freeze(["service", "category", "product", "language", "approvalStatus"]);

export const serializeFilters = (filters = {}) => Object.fromEntries(
  FILTER_KEYS.filter((key) => filters?.[key] !== undefined).map((key) => [key, filters[key]]),
);

export const serializeLexicalRequest = (input, { topK = input?.topK } = {}) => ({
  query: input.query,
  filters: serializeFilters(input.filters),
  topK,
  minScore: input.minScore,
});

export const serializeSemanticRequest = (input, { topK = input?.topK, signal = input?.signal } = {}) => ({
  query: input.query,
  filters: serializeFilters(input.filters),
  topK,
  semanticMinScore: input.semanticMinScore,
  ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  ...(signal === undefined ? {} : { signal }),
});

export const createHybridFusionInput = (input) => ({
  query: input.query,
  filters: serializeFilters(input.filters),
  topK: input.topK,
});
