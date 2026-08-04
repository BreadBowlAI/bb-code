const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "i", "in", "is", "it", "of", "on", "or", "please", "that", "the", "this", "to", "we", "with", "you"]);

export function buildSemanticQuery(prompt: string, paths: string[] = []): string {
  const withoutCode = prompt.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]+`/g, " ");
  const withoutSecrets = withoutCode
    .replace(/\b(?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, " ")
    .replace(/\bBearer\s+\S+/gi, " ")
    .replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, " ");
  const terms = withoutSecrets.toLowerCase().match(/[a-z0-9_.@/-]{2,}/g) ?? [];
  const selected = [...new Set([...paths.map((path) => path.toLowerCase()), ...terms.filter((term) => !STOP_WORDS.has(term))])].slice(0, 32);
  return selected.join(" ").slice(0, 512);
}
