import de from '../../messages/terms.de.json';
import en from '../../messages/terms.en.json';
import type { Locale } from './config';

const terms: Record<Locale, Record<string, string>> = { en, de };

export const termFor = (locale: Locale, name: string): string => terms[locale][name] ?? name;
