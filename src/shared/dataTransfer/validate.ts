import type { SourceData } from '../dataMerger/dataMerger';
import { isPlainObject } from './payload';
import { createTranslator } from '../i18n';
import type { Language, PlainMessageKey, TranslateFn } from '../i18n';

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
    | {
          ok: false;
          /** At most 20 findings plus the trailing "and N more" line. */
          issues: ValidationIssue[];
          /**
           * The same findings, up to 500 and without the trailing count, kept
           * so the main process can write them to `data.log`. The dialog cannot
           * show them all, but a bug report needs the pattern.
           */
          recordedIssues: ValidationIssue[];
          /** Every finding, including the ones beyond the recorded cap. */
          total: number;
      };

/**
 * How many findings the dialog shows before the rest are only counted.
 *
 * A file that went wrong in one systematic way (say, every record is missing
 * its `startTime`) would otherwise produce tens of thousands of identical
 * lines, which is not readable in a dialog. The first ones are enough to see
 * the pattern.
 */
const MAX_SHOWN_ISSUES = 20;

/**
 * How many findings are kept for `data.log`.
 *
 * The dialog can only show a screenful, but a bug report needs more than that:
 * one bad record among a thousand is invisible in the first twenty findings.
 * 500 lines is enough to locate the pattern and still bounded, so a
 * systematically broken file cannot exhaust memory or the log file.
 */
export const MAX_RECORDED_ISSUES = 500;

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

/** Language aware variant used by the validator below. */
function describeLocalized(value: unknown, t: TranslateFn): string {
    if (value === null) {
        return t('guard.describe.null');
    }

    if (Array.isArray(value)) {
        return t('guard.describe.array');
    }

    return typeof value === 'object'
        ? t('guard.describe.object')
        : t('guard.describe.type', String(typeof value));
}

function describeEntryListLocalized(value: unknown, t: TranslateFn): string {
    if (!Array.isArray(value)) {
        return describeLocalized(value, t);
    }

    const bad = value.findIndex((entry) => !isNonEmptyString(entry));
    if (bad < 0) {
        return t('guard.describe.emptyStrings');
    }

    return t('guard.describe.entry', bad, describeLocalized(value[bad], t));
}

/**
 * Collector that keeps two views of the same findings: the first few for the
 * dialog, more of them for the log file, and a count of everything.
 */
class IssueCollector {
    private readonly recorded: ValidationIssue[] = [];
    private total = 0;

    constructor(readonly t: TranslateFn) {}

    add(path: string, message: string) {
        this.total += 1;
        if (this.recorded.length < MAX_RECORDED_ISSUES) {
            this.recorded.push({ path, message });
        }
    }

    /** True as soon as one finding was recorded, beyond the caps included. */
    get failed(): boolean {
        return this.total > 0;
    }

    /** The findings the dialog shows, plus the trailing "and N more" line. */
    shown(): ValidationIssue[] {
        const visible = this.recorded.slice(0, MAX_SHOWN_ISSUES);
        const hidden = this.total - visible.length;
        if (hidden <= 0) {
            return visible;
        }

        return [...visible, { path: '', message: this.t('guard.import.overflow', hidden) }];
    }

    /** Everything kept for the log file. */
    recordedIssues(): ValidationIssue[] {
        return this.recorded;
    }

    /** Every finding, including those beyond `MAX_RECORDED_ISSUES`. */
    get count(): number {
        return this.total;
    }
}

type ValidationFailure = Extract<ValidationResult, { ok: false }>;

function failure(issues: IssueCollector): ValidationFailure {
    return {
        ok: false,
        issues: issues.shown(),
        recordedIssues: issues.recordedIssues(),
        total: issues.count,
    };
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
    expectationKey: PlainMessageKey,
    issues: IssueCollector
) {
    const t = issues.t;
    const value = holder[key];
    if (value === undefined) {
        issues.add(`${path}.${key}`, t('guard.import.missing', t(expectationKey)));
        return;
    }

    if (!predicate(value)) {
        const found =
            predicate === isStringArray
                ? describeEntryListLocalized(value, t)
                : describeLocalized(value, t);
        issues.add(`${path}.${key}`, t('guard.import.mismatch', t(expectationKey), found));
    }
}

function checkArrayField(value: unknown, path: string, issues: IssueCollector): any[] | undefined {
    if (value === undefined) {
        issues.add(path, issues.t('guard.import.missing', issues.t('guard.expect.array')));
        return undefined;
    }

    if (!Array.isArray(value)) {
        issues.add(path, issues.t('guard.import.array', describeLocalized(value, issues.t)));
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
        issues.add(path, issues.t('guard.import.missing', issues.t('guard.expect.object')));
        return undefined;
    }

    if (!isPlainObject(value)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(value, issues.t)));
        return undefined;
    }

    return value;
}

function checkRecord(record: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(record)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(record, issues.t)));
        return;
    }

    requireField(record, '_id', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(record, 'startTime', path, isFiniteNumber, 'guard.expect.finiteNumber', issues);
    requireField(
        record,
        'spentTimeInHour',
        path,
        isFiniteNumber,
        'guard.expect.finiteNumber',
        issues
    );

    // Optional by design (older exports predate them), but a wrong-typed value
    // still breaks the charts that read them, so they are checked when present.
    if (record.apps !== undefined && !isPlainObject(record.apps)) {
        issues.add(
            `${path}.apps`,
            issues.t('guard.import.object', describeLocalized(record.apps, issues.t))
        );
    }

    if (record.switchTimes !== undefined && !isFiniteNumber(record.switchTimes)) {
        issues.add(
            `${path}.switchTimes`,
            issues.t('guard.import.finiteNumber', describeLocalized(record.switchTimes, issues.t))
        );
    }
}

function checkCard(card: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(card)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(card, issues.t)));
        return;
    }

    requireField(card, '_id', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(card, 'sessionIds', path, isStringArray, 'guard.expect.stringArray', issues);
    checkSpentTime(card.spentTimeInHour, `${path}.spentTimeInHour`, issues);
}

function checkList(list: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(list)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(list, issues.t)));
        return;
    }

    requireField(list, '_id', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(list, 'cards', path, isStringArray, 'guard.expect.stringArray', issues);
}

function checkBoard(board: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(board)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(board, issues.t)));
        return;
    }

    requireField(board, '_id', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(board, 'lists', path, isStringArray, 'guard.expect.stringArray', issues);
}

function checkMove(row: unknown, path: string, issues: IssueCollector) {
    if (!isPlainObject(row)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(row, issues.t)));
        return;
    }

    requireField(row, 'cardId', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(row, 'fromListId', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(row, 'toListId', path, isNonEmptyString, 'guard.expect.nonEmptyString', issues);
    requireField(row, 'time', path, isFiniteNumber, 'guard.expect.finiteNumber', issues);
}

/**
 * A card's `spentTimeInHour` is nested, and the merger reads `.actual` off it
 * unguarded, so a card whose spent time is missing or malformed is fatal.
 */
function checkSpentTime(value: unknown, path: string, issues: IssueCollector) {
    if (value === undefined) {
        issues.add(path, issues.t('guard.import.missingSpentTime'));
        return;
    }

    if (!isPlainObject(value)) {
        issues.add(path, issues.t('guard.import.object', describeLocalized(value, issues.t)));
        return;
    }

    requireField(value, 'actual', path, isFiniteNumber, 'guard.expect.finiteNumber', issues);
    requireField(value, 'estimated', path, isFiniteNumber, 'guard.expect.finiteNumber', issues);
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
                    issues.t('guard.import.refersToCard', JSON.stringify(cardId))
                );
            }
        }
    }

    for (const board of Object.values(data.boards)) {
        for (const listId of board.lists) {
            if (!data.lists[listId]) {
                issues.add(
                    `boards[${JSON.stringify(board._id)}].lists`,
                    issues.t('guard.import.refersToList', JSON.stringify(listId))
                );
            }
        }
    }

    for (const row of data.move) {
        if (!data.cards[row.cardId]) {
            warnings.push({
                path: 'move',
                message: issues.t('guard.import.moveDropped', JSON.stringify(row.cardId)),
            });
        }
    }

    for (const card of Object.values(data.cards)) {
        for (const sessionId of card.sessionIds) {
            if (!data.records.some((record) => record._id === sessionId)) {
                warnings.push({
                    path: `cards[${JSON.stringify(card._id)}].sessionIds`,
                    message: issues.t('guard.import.sessionNotCounted', JSON.stringify(sessionId)),
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
export function validateSourceData(raw: unknown, language: Language = 'en'): ValidationResult {
    const t = createTranslator(language);
    const issues = new IssueCollector(t);
    if (!isPlainObject(raw)) {
        issues.add('', t('guard.import.fileNotObject', describeLocalized(raw, t)));
        return failure(issues);
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
        return failure(issues);
    }

    return { ok: true, data: raw as unknown as SourceData, warnings };
}
