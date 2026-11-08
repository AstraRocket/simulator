import en from '../../src/i18n/locales/en.json';
import { importNoteText, type ImportNote } from '../../src/services/files/importNote';
import { localeTranslator } from './localeTranslator';

const english = localeTranslator(en);

export const noteText = (note: ImportNote): string => importNoteText(note, english);

export const noteTexts = (notes: readonly ImportNote[] | undefined): string[] => (notes ?? []).map(noteText);
