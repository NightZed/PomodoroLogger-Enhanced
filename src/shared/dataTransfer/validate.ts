import type { SourceData } from '../dataMerger/dataMerger';
import { isPlainObject } from './payload';

/**
 * Why an import file is refused, in the words of the person who has to fix it.
 *
 * `path` points at the offending value (`records[3].startTime`,
 * `cards["a1b2"].sessionIds[2]`, ...) and `message` says what is wrong with
 * it, so a user can find the spot in their file instead of guessing from a
 * stack trace. The path is deliberately JSON-shaped: it is also the query you
 * would run against the file to see the value.
 */
export interface ValidationIssue {
    path: string;
    message: string;
}

/** A finding that does not block the import, but the user should know about. */
export interface ValidationWarning {
    path: string;
    message: string;
}

export type ValidationResult =
    | { ok: true; data: SourceData; warnings: ValidationWarning[] }
    | { ok: false; issues: ValidationIssue[] };

/**
 * How many findings are reported before the rest are only counted.
 *
 * A file that went wrong in one systematic way (say, every record is missing
 * its `startTime`) would otherwise produce tens of thousands of identical
 * lines, which is neither readable in a dialog nor useful. The first ones are
 * enough to see the pattern.
 */
const MAX_ISSUES = 20;

export const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

export const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0;

export const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(isNonEmptyString);

export const describe = (value: unknown): string => {
    if (value === null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        return 'an array';
    }

    return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
};

/**
 * Describes an array that passed the "is an array" test but holds entries of
 * the wrong kind: saying "it is an array" next to "should be an array of
 * strings" reads like a contradiction, and hides which entry is at fault.
 */
export const describeEntryList = (value: unknown): string => {
    if (!Array.isArray(value)) {
        return describe(value);
    }

    const bad = value.findIndex((entry) => !isNonEmptyString(entry));
    if (bad < 0) {
        return 'an array of empty strings';
    }

    return `an array whose entry ${bad} is ${describe(value[bad])}`;
};

/** Collector that keeps the reported findings bounded while counting the rest. */
class IssueCollector {
    readonly issues: ValidationIssue[] = [];
    private overflow = 0;

    add(path: string, message: string) {
        if (this.issues.length < MAX_ISSUES) {
            this.issues.push({ path, message });
        } else {
            this.overflow += 1;
        }
    }

    /** True as soon as one finding was recorded, overflow included. */
    get failed(): boolean {
        return this.issues.length > 0 || this.overflow > 0;
    }

    /** The findings plus the trailing "and N more" line, when truncated. */
    all(): ValidationIssue[] {
        if (this.overflow === 0) {
            return this.issues;
        }

        return [
            ...this.issues,
            { path: '', message: `and ${this.overflow} more problem(s) not listed` },
        ];
    }
}

/**
 * Required field check with one message shape for every kind of value.
 *
 * `predicate === isStringArray` gets the entry-level description, so an array
 * that is an array but holds a number is reported as such instead of the
 * self-contradictory "should be an array of strings, but is an array".
 */
export function requireField(
    holder: { [key: string]: any },
    key: string,
    path: string,
    predicate: (v: unknown) => boolean,
    expectation: string,
    issues: IssueCollector
) {
    const value = holder[key];
    if (value === undefined) {
        issues.add(`${path}.${key}`, `is missing; ${expectation} is required`);
        return;
    }

    if (!predicate(value)) {
        const found = predicate === isStringArray ? describeEntryList(value) : describe(value);
        issues.add(`${path}.${key}`, `should be ${expectation}, but is ${found}`);
    }
}

function checkArrayField(value: unknown, path: string, issues: IssueCollector): any[] | undefined {
    if (value === undefined) {
        issues.add(path, 'is missing; an array is required');
        return undefined;
    }

    if (!Array.isArray(value)) {
        issues.add(path, `should be an array, but is ${describe(value)}`);
        return undefined;
    }

    return value;
}

function checkObjectField(
    value: unknown,
    path: string,
    issues: IssueCollector
): { [key: string]: any } | undefined {
    if (value === undefined) {
        issues.add(path, 'is missing; an object is required');
        return undefined;
    }

    if (!isPlainObject(value)) {
        issues.add(path, `should be an object, but is ${describe(value)}`);
        return undefined;
    }

    return value;
}

function checkRecord(record: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(record)) {
        issues.add(path, `should be an object, but is ${describe(record)}`);
        return;
    }

    requireField(record, '_id', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(record, 'startTime', path, isFiniteNumber, 'a finite number', issues);
    requireField(record, 'spentTimeInHour', path, isFiniteNumber, 'a finite number', issues);

    // Optional by design (older exports predate them), but a wrong-typed value
    // still breaks the charts that read them, so they are checked when present.
    if (record.apps !== undefined && !isPlainObject(record.apps)) {
        issues.add(`${path}.apps`, `should be an object, but is ${describe(record.apps)}`);
    }

    if (record.switchTimes !== undefined && !isFiniteNumber(record.switchTimes)) {
        issues.add(
            `${path}.switchTimes`,
            `should be a finite number, but is ${describe(record.switchTimes)}`
        );
    }
}

function checkCard(card: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(card)) {
        issues.add(path, `should be an object, but is ${describe(card)}`);
        return;
    }

    requireField(card, '_id', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(card, 'sessionIds', path, isStringArray, 'an array of strings', issues);
    checkSpentTime(card.spentTimeInHour, `${path}.spentTimeInHour`, issues);
}

function checkList(list: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(list)) {
        issues.add(path, `should be an object, but is ${describe(list)}`);
        return;
    }

    requireField(list, '_id', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(list, 'cards', path, isStringArray, 'an array of strings', issues);
}

function checkBoard(board: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(board)) {
        issues.add(path, `should be an object, but is ${describe(board)}`);
        return;
    }

    requireField(board, '_id', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(board, 'lists', path, isStringArray, 'an array of strings', issues);
}

function checkMove(row: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(row)) {
        issues.add(path, `should be an object, but is ${describe(row)}`);
        return;
    }

    requireField(row, 'cardId', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(row, 'fromListId', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(row, 'toListId', path, isNonEmptyString, 'a non-empty string', issues);
    requireField(row, 'time', path, isFiniteNumber, 'a finite number', issues);
}

/**
 * A card's `spentTimeInHour` is nested, and the merger reads `.actual` off it
 * unguarded, so a card whose spent time is missing or malformed is fatal.
 */
function checkSpentTime(value: unknown, path: string, issues: IssueCollector) {
    if (value === undefined) {
        issues.add(path, 'is missing; an object with "actual" and "estimated" is required');
        return;
    }

    if (!isPlainObject(value)) {
        issues.add(path, `should be an object, but is ${describe(value)}`);
        return;
    }

    requireField(value, 'actual', path, isFiniteNumber, 'a finite number', issues);
    requireField(value, 'estimated', path, isFiniteNumber, 'a finite number', issues);
}

/**
 * Ids that point at nothing.
 *
 * A list holding a card id that is not in the file, or a board holding a list
 * id that is not in the file, is fatal: the merger walks those references
 * without guards (`travelCards` dereferences them), and it does so *after*
 * `writeAllFile` has already emptied every database, so the crash would leave
 * the user with the data gone and nothing imported.
 *
 * The same kind of dangling id on a `move` row or a card's `sessionIds` is
 * only orphaned bookkeeping: the merger tolerates it (a missing record
 * contributes 0 hours) and drops the row, so it is reported as a warning that
 * does not block the import.
 */
function checkReferences(data: SourceData, issues: IssueCollector, warnings: ValidationWarning[]) {
    for (const list of Object.values(data.lists)) {
        for (const cardId of list.cards) {
            if (!data.cards[cardId]) {
                issues.add(
                    `lists[${JSON.stringify(list._id)}].cards`,
                    `refers to card ${JSON.stringify(cardId)}, which is not in the file`
                );
            }
        }
    }

    for (const board of Object.values(data.boards)) {
        for (const listId of board.lists) {
            if (!data.lists[listId]) {
                issues.add(
                    `boards[${JSON.stringify(board._id)}].lists`,
                    `refers to list ${JSON.stringify(listId)}, which is not in the file`
                );
            }
        }
    }

    for (const row of data.move) {
        if (!data.cards[row.cardId]) {
            warnings.push({
                path: 'move',
                message:
                    `a move of card ${JSON.stringify(row.cardId)} refers to a card ` +
                    'that is not in the file; the move will be dropped',
            });
        }
    }

    for (const card of Object.values(data.cards)) {
        for (const sessionId of card.sessionIds) {
            if (!data.records.some((record) => record._id === sessionId)) {
                warnings.push({
                    path: `cards[${JSON.stringify(card._id)}].sessionIds`,
                    message:
                        `refers to pomodoro ${JSON.stringify(sessionId)}, which is not in ` +
                        'the file; its time will not be counted',
                });
            }
        }
    }
}

/**
 * Checks that a parsed import file really is a `SourceData`.
 *
 * The rule is deliberately all-or-nothing: a file that fails is refused whole,
 * because the merge that follows writes over every database, and a partially
 * understood file is exactly how a user loses the records they were trying to
 * migrate. Every finding below is something that would either throw inside the
 * merger or render as broken data afterwards.
 *
 * Findings the merger handles on its own (it drops them and warns) come back
 * as `warnings` instead, so they surface without blocking the import.
 */
export function validateSourceData(raw: unknown): ValidationResult {
    const issues = new IssueCollector();
    if (!isPlainObject(raw)) {
        issues.add('', `the file must contain an object, but it contains ${describe(raw)}`);
        return { ok: false, issues: issues.all() };
    }

    const records = checkArrayField(raw.records, 'records', issues);
    const move = checkArrayField(raw.move, 'move', issues);
    const cards = checkObjectField(raw.cards, 'cards', issues);
    const lists = checkObjectField(raw.lists, 'lists', issues);
    const boards = checkObjectField(raw.boards, 'boards', issues);

    if (records) {
        records.forEach((record, i) => checkRecord(record, `records[${i}]`, issues));
    }

    if (move) {
        move.forEach((row, i) => checkMove(row, `move[${i}]`, issues));
    }

    for (const [id, card] of Object.entries(cards ?? {})) {
        checkCard(card, `cards[${JSON.stringify(id)}]`, issues);
    }

    for (const [id, list] of Object.entries(lists ?? {})) {
        checkList(list, `lists[${JSON.stringify(id)}]`, issues);
    }

    for (const [id, board] of Object.entries(boards ?? {})) {
        checkBoard(board, `boards[${JSON.stringify(id)}]`, issues);
    }

    const warnings: ValidationWarning[] = [];
    if (!issues.failed && records && cards && lists && boards) {
        // Reference checks read the entries unguarded, so they only run once
        // the shape of every container is known to be good.
        checkReferences(
            {
                records,
                cards,
                lists,
                boards,
                move: move ?? [],
            } as unknown as SourceData,
            issues,
            warnings
        );
    }

    if (issues.failed) {
        return { ok: false, issues: issues.all() };
    }

    return { ok: true, data: raw as unknown as SourceData, warnings };
}
