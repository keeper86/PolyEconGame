const EPSILON = 1e-3;

export function formatNumbers(n: number | null | undefined, dimension: number = 1): string {
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
        [1_000_000_000_000_000_000_000 ** dimension, 'S'],
        [1_000_000_000_000_000_000 ** dimension, 'Qt'],
        [1_000_000_000_000_000 ** dimension, 'Q'],
        [1_000_000_000_000 ** dimension, 'T'],
        [1_000_000_000 ** dimension, 'B'],
        [1_000_000 ** dimension, 'M'],
        [1_000 ** dimension, 'k'],
    ];
    if (dimension >= 2) {
        abbreviations.push([1_00 ** dimension, 'h']);
    }
    if (dimension >= 3) {
        abbreviations.push([1_0 ** dimension, 'da']);
    }
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
