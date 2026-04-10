export function tokenize(keyword: string): string[] {
  return keyword.trim().split(/\s+/).filter(Boolean);
}

function partialMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 2 && b.length >= 2) {
    return a.includes(b) || b.includes(a);
  }
  return false;
}

export function isSimilar(keyword1: string, keyword2: string, threshold = 0.7): boolean {
  const tokens1 = tokenize(keyword1);
  const tokens2 = tokenize(keyword2);
  const maxLen = Math.max(tokens1.length, tokens2.length);
  if (maxLen === 0) return true;

  let matchCount = 0;
  const used = new Set<number>();

  for (const t1 of tokens1) {
    for (let j = 0; j < tokens2.length; j++) {
      if (!used.has(j) && partialMatch(t1, tokens2[j])) {
        matchCount++;
        used.add(j);
        break;
      }
    }
  }

  return matchCount / maxLen >= threshold;
}

export function findDuplicates(newKeyword: string, existingKeywords: string[]): boolean {
  return existingKeywords.some((existing) => isSimilar(newKeyword, existing));
}
