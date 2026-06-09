const EPSILON = 1e-3;

export function formatNumbers(n: number | null | undefined): string {
    if (n == null || !isFinite(n)) {
        return '—';
    }
    if (Math.abs(n) < EPSILON) {
        if (n === 0) {
            return '0';
        }
        return '<' + EPSILON;
    }

    let currentNumber = n;
    let currentSuffix = '';
    const abbreviations: [number, string][] = [
        [1_000_000_000_000_000_000_000, 'S'],
        [1_000_000_000_000_000_000, 'Qt'],
        [1_000_000_000_000_000, 'Q'],
        [1_000_000_000_000, 'T'],
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [value, suffix] of abbreviations) {
        if (Math.abs(n) * 1.05 >= value) {
            currentSuffix = suffix;
            currentNumber = n / value;
            break;
        }
    }

    const leadingWithZero = Math.trunc(currentNumber) === 0;
    const formatted = currentNumber.toPrecision(leadingWithZero ? 2 : 3);

    return (
        formatted
            .replace(/(\.\d*?[1-9])0+$/u, '$1')
            .replace(/\.0+$/u, '')
            .replace(/\.$/u, '') + currentSuffix
    );
}

export function formatCargoQty(n: number, form: string): string {
    const s = formatNumbers(n);
    return form === 'liquid' ? `${s}ℓ` : `${s}t`;
}
