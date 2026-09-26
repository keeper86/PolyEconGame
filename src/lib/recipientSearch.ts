export type RecipientCandidate = {
    userId: string;
    displayName: string | null;
    companyName: string | null;
};

const MIN_SCORE = 0.3;

export const normalizeSearchText = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();

const tokenize = (value: string): string[] => value.split(/[^a-z0-9]+/u).filter((token) => token !== '');

const levenshtein = (a: string, b: string): number => {
    if (a === b) {
        return 0;
    }
    if (a.length === 0) {
        return b.length;
    }
    if (b.length === 0) {
        return a.length;
    }

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
        }
        previous = current;
    }
    return previous[b.length];
};

const similarity = (a: string, b: string): number => {
    const longest = Math.max(a.length, b.length);
    if (longest === 0) {
        return 1;
    }
    return 1 - levenshtein(a, b) / longest;
};

const bestWindowSimilarity = (query: string, field: string): number => {
    let best = similarity(query, field);
    for (const token of tokenize(field)) {
        best = Math.max(best, similarity(query, token));
    }
    for (let start = 0; start + query.length <= field.length; start++) {
        best = Math.max(best, similarity(query, field.slice(start, start + query.length)));
    }
    return best;
};

const isSubsequence = (query: string, field: string): boolean => {
    let index = 0;
    for (const char of field) {
        if (char === query[index]) {
            index++;
        }
        if (index === query.length) {
            return true;
        }
    }
    return index === query.length;
};

export const fieldScore = (normalizedQuery: string, rawField: string | null): number => {
    if (rawField === null) {
        return 0;
    }
    const field = normalizeSearchText(rawField);
    if (field === '') {
        return 0;
    }
    if (field === normalizedQuery) {
        return 1;
    }
    if (field.startsWith(normalizedQuery)) {
        return 0.9;
    }
    if (field.includes(normalizedQuery)) {
        return 0.8;
    }

    const tokens = tokenize(field);
    if (tokens.some((token) => token.startsWith(normalizedQuery))) {
        return 0.75;
    }
    const initials = tokens.map((token) => token[0]).join('');
    if (initials.startsWith(normalizedQuery)) {
        return 0.65;
    }

    const window = bestWindowSimilarity(normalizedQuery, field);
    if (window >= 0.7) {
        return 0.4 + ((window - 0.7) / 0.3) * 0.35;
    }
    if (normalizedQuery.length >= 3 && isSubsequence(normalizedQuery, field)) {
        return 0.35;
    }
    return 0;
};

export const scoreCandidate = (candidate: RecipientCandidate, rawQuery: string): number => {
    const query = normalizeSearchText(rawQuery);
    if (query === '') {
        return 1;
    }
    return Math.max(
        fieldScore(query, candidate.displayName),
        fieldScore(query, candidate.companyName) * 0.98,
        fieldScore(query, candidate.userId) * 0.95,
    );
};

export const rankRecipients = (
    candidates: RecipientCandidate[],
    rawQuery: string,
    limit: number,
): RecipientCandidate[] => {
    if (normalizeSearchText(rawQuery) === '') {
        return candidates.slice(0, limit);
    }
    return candidates
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, rawQuery) }))
        .filter((entry) => entry.score >= MIN_SCORE)
        .sort(
            (a, b) => b.score - a.score || (a.candidate.displayName ?? '').localeCompare(b.candidate.displayName ?? ''),
        )
        .slice(0, limit)
        .map((entry) => entry.candidate);
};
