import type { Card } from '../type';

/**
 * Relative error of one card's estimate, in percent.
 *
 * Returns `undefined` when the card cannot be rated: it is not in the done
 * list, or either of its two hours is still zero. Both the board overview card
 * and the table column must go through this one function -- the two used to
 * carry their own copy of the formula.
 *
 * Note the denominator used by the callers: every done card is counted, but
 * only rated ones contribute to the sum, so cards without an estimate dilute
 * the average. That is the table's long-standing behaviour; keep both views on
 * it until the wording is changed in one place.
 */
export const cardPercentageError = (card: Card, isDone: boolean): number | undefined => {
    const { actual, estimated } = card.spentTimeInHour;
    if (!isDone || actual === 0 || estimated === 0) {
        return undefined;
    }

    return (Math.abs(estimated - actual) / actual) * 100;
};

/** The table's "mean error" text, shared so both views print the same number. */
export const formatPercentageError = (value: number): string => `${value.toFixed(2)}%`;

/**
 * Grade for one board's mean error, best first. The thresholds are the ones
 * the card used when it still printed "perfect / good / ...".
 *
 * These letters are a rating scale, not prose: they are the same in every
 * language, so they are not in the i18n catalog.
 */
const ACCURACY_GRADES = [
    { below: 5, grade: 'SSS' },
    { below: 10, grade: 'S' },
    { below: 20, grade: 'A+' },
    { below: 30, grade: 'A' },
] as const;

export const accuracyGrade = (value: number): string =>
    ACCURACY_GRADES.find((entry) => value < entry.below)?.grade ?? 'A-';
