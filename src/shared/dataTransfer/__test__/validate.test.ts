/**
 * What the import is allowed to accept.
 *
 * The contract is all-or-nothing: a file either imports or is refused whole,
 * because the merge behind it deletes every database before writing the result
 * back. A validator that lets a broken file through does not fail loudly -- it
 * loses the user's records quietly, which is the one outcome this whole module
 * exists to prevent.
 *
 * The test data starts from a file this app really exports (the `case0` fixture
 * of the merge tests is a valid export), and each case breaks exactly one thing
 * so the reported problem can be pointed at precisely.
 */
import { validateSourceData } from '../validate';
import { SourceData } from '../../dataMerger/dataMerger';
import { data as validData } from '../../dataMerger/__test__/case0/a';

const clone = (): any => JSON.parse(JSON.stringify(validData));

/** Runs the validator and returns the reported problems as `path message`. */
function problemsOf(raw: unknown): string[] {
    const result = validateSourceData(raw);
    if (result.ok) {
        return [];
    }

    return result.issues.map((issue) =>
        issue.path ? `${issue.path} ${issue.message}` : issue.message
    );
}

function pathsOf(raw: unknown): string[] {
    const result = validateSourceData(raw);
    return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe('a valid export', () => {
    it('passes, and returns the data untouched', () => {
        const result = validateSourceData(clone());
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toStrictEqual(validData as SourceData);
            expect(result.warnings).toStrictEqual([]);
        }
    });

    it('passes an empty data set (a fresh install exports this)', () => {
        const result = validateSourceData({
            records: [],
            cards: {},
            lists: {},
            boards: {},
            move: [],
        });
        expect(result.ok).toBe(true);
    });

    it('accepts the optional record fields being absent', () => {
        const raw = clone();
        delete raw.records[0].apps;
        delete raw.records[0].switchTimes;
        expect(validateSourceData(raw).ok).toBe(true);
    });

    it('rejects the non-finite numbers JSON cannot produce but a hand-edited file can', () => {
        const raw = clone();
        raw.records[0].startTime = null;
        expect(problemsOf(raw)).toContain(
            'records[0].startTime should be a finite number, but is null'
        );
    });
});

describe('a file that is not a data export', () => {
    it.each([
        ['a string', 'hello'],
        ['a number', 42],
        ['null', null],
        ['an array', []],
    ])('rejects %s outright', (_name, raw) => {
        const result = validateSourceData(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues[0].message).toMatch(/must contain an object/);
        }
    });

    it('names every container that is missing', () => {
        expect(pathsOf({})).toEqual(
            expect.arrayContaining(['records', 'cards', 'lists', 'boards', 'move'])
        );
    });

    it('rejects a container of the wrong type', () => {
        const raw = clone();
        raw.records = { 0: validData.records[0] };
        expect(problemsOf(raw)).toContain('records should be an array, but is an object');
    });

    it('rejects an array where an object belongs', () => {
        const raw = clone();
        raw.cards = [];
        expect(problemsOf(raw)).toContain('cards should be an object, but is an array');
    });
    describe('a damaged entry', () => {
        it('points at the record and the field that is missing', () => {
            const raw = clone();
            delete raw.records[0].startTime;
            expect(problemsOf(raw)).toContain(
                'records[0].startTime is missing; a finite number is required'
            );
        });

        it('points at a record whose field is of the wrong type', () => {
            const raw = clone();
            raw.records[0]._id = 7;
            expect(problemsOf(raw)).toContain(
                'records[0]._id should be a non-empty string, but is a number'
            );
        });

        it('reports a non-object entry instead of crashing on it', () => {
            const raw = clone();
            raw.records.push('oops');
            expect(problemsOf(raw)).toContain('records[1] should be an object, but is a string');
        });

        it('reports an entry nested in a map by its id', () => {
            const raw = clone();
            delete raw.cards.card_a.spentTimeInHour.actual;
            expect(problemsOf(raw)).toContain(
                'cards["card_a"].spentTimeInHour.actual is missing; a finite number is required'
            );
        });

        it('reports a card whose spent time is missing as a whole', () => {
            const raw = clone();
            delete raw.cards.card_a.spentTimeInHour;
            expect(problemsOf(raw)).toContain(
                'cards["card_a"].spentTimeInHour is missing; ' +
                    'an object with "actual" and "estimated" is required'
            );
        });

        it('checks the array fields of all five kinds', () => {
            const raw = clone();
            raw.lists.done.cards = ['card_a', 5];
            raw.boards.a.lists = [null];
            raw.cards.card_a.sessionIds = 'sess0';
            raw.move.push({ cardId: 'c', fromListId: 'l', toListId: 'l' });

            expect(problemsOf(raw)).toEqual(
                expect.arrayContaining([
                    'lists["done"].cards should be an array of strings, but is an array whose entry 1 is a number',
                    'boards["a"].lists should be an array of strings, but is an array whose entry 0 is null',
                    'cards["card_a"].sessionIds should be an array of strings, but is a string',
                    'move[0].time is missing; a finite number is required',
                ])
            );
        });

        it('reports every problem at once instead of stopping at the first', () => {
            const raw = clone();
            delete raw.records[0].startTime;
            delete raw.lists.done._id;
            raw.move.push({});
            expect(pathsOf(raw)).toEqual(
                expect.arrayContaining([
                    'records[0].startTime',
                    'lists["done"]._id',
                    'move[0].cardId',
                ])
            );
        });
    });
    describe('references that point at nothing', () => {
        it('refuses a list holding a card that is not in the file', () => {
            // Fatal rather than a warning: `travelCards` dereferences it while
            // recomputing the board totals, which runs *after* the databases have
            // been emptied, so the user would lose everything and import nothing.
            const raw = clone();
            raw.lists.done.cards.push('ghost');
            const result = validateSourceData(raw);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.issues[0].path).toBe('lists["done"].cards');
                expect(result.issues[0].message).toBe(
                    'refers to card "ghost", which is not in the file'
                );
            }
        });

        it('refuses a board holding a list that is not in the file', () => {
            const raw = clone();
            raw.boards.a.lists.push('ghost');
            expect(problemsOf(raw)).toContain(
                'boards["a"].lists refers to list "ghost", which is not in the file'
            );
        });

        it('only warns about a move of a card that is not in the file', () => {
            // The merger drops such a row on its own, so it must not block an
            // otherwise fine import.
            const raw = clone();
            raw.move.push({
                cardId: 'ghost',
                fromListId: 'done',
                toListId: 'focused',
                time: 1,
            });
            const result = validateSourceData(raw);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.warnings.map((w) => w.message).join()).toMatch(
                    /move of card "ghost".*will be dropped/
                );
            }
        });

        it('only warns about a card pointing at a pomodoro that is not in the file', () => {
            const raw = clone();
            raw.cards.card_a.sessionIds.push('ghost-session');
            const result = validateSourceData(raw);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.warnings.map((w) => w.message).join()).toMatch(
                    /pomodoro "ghost-session".*will not be counted/
                );
            }
        });

        it('does not run the reference checks when the shapes are already broken', () => {
            // `travelCards` would dereference these, which is why the reference
            // pass only starts once every container is known to be well formed.
            const raw = clone();
            raw.lists.done = { cards: 'card_a' } as any;
            raw.boards.a.lists = 'done' as any;
            expect(() => validateSourceData(raw)).not.toThrow();
            expect(validateSourceData(raw).ok).toBe(false);
        });
    });

    describe('the volume of findings', () => {
        it('bounds the report and counts what it left out', () => {
            const raw = clone();
            raw.records = Array.from({ length: 100 }, (_, i) => ({
                _id: `r${i}`,
                spentTimeInHour: 1,
            }));
            const result = validateSourceData(raw);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                // The 20 reported ones plus the line saying 80 were left out.
                expect(result.issues).toHaveLength(21);
                expect(result.issues[20].message).toBe('and 80 more problem(s) not listed');
            }
        });
    });
});
