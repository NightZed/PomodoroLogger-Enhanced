/**
 * The export file's own shape: the timestamp in the name, the header inside,
 * and the ability to still read the files this app wrote before the header
 * existed (the automatic backups in `db-bk/` are still written bare).
 */
import {
    buildExportFileName,
    buildExportPayload,
    formatFileStamp,
    EXPORT_FORMAT,
    unwrapImportPayload,
} from '../payload';
import { SourceData } from '../../dataMerger/dataMerger';

const emptyData: SourceData = {
    boards: {},
    cards: {},
    lists: {},
    move: [],
    records: [],
};

/** Local noon of a fixed day, so the assertions do not depend on the timezone. */
const date = new Date(2026, 9, 4, 15, 4, 5);

describe('export file name', () => {
    it('stamps the name so two exports never overwrite each other', () => {
        expect(buildExportFileName(date)).toBe('pomodoro-logger-data-2026-10-04-15-04-05.json');
    });

    it('uses no character that is illegal in a file name on any platform', () => {
        // `:` is the reason the time is dash separated here: Windows rejects it,
        // and a name that cannot be saved would be an export that never lands.
        expect(formatFileStamp(date)).not.toMatch(/[:*?"<>|]/);
    });

    it('pads single digit parts so the names stay sortable', () => {
        expect(buildExportFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe(
            'pomodoro-logger-data-2026-01-02-03-04-05.json'
        );
    });
});

describe('export header', () => {
    it('records when the export was taken, both machine and human readable', () => {
        const payload = buildExportPayload(emptyData, date);
        expect(payload.format).toBe(EXPORT_FORMAT);
        expect(payload.exportedAt).toBe(date.getTime());
        expect(payload.exportedAtText).toBe('2026-10-04 15:04:05');
        expect(payload.data).toBe(emptyData);
    });

    it('survives a JSON round trip', () => {
        const payload = buildExportPayload(emptyData, date);
        const { data, meta } = unwrapImportPayload(JSON.parse(JSON.stringify(payload)));
        expect(data).toStrictEqual(emptyData);
        expect(meta.exportedAt).toBe(date.getTime());
        expect(meta.exportedAtText).toBe('2026-10-04 15:04:05');
    });
});

describe('reading an import file', () => {
    it('unwraps an export file', () => {
        const { data, meta } = unwrapImportPayload(buildExportPayload(emptyData, date));
        expect(data).toStrictEqual(emptyData);
        expect(meta.exportedAtText).toBe('2026-10-04 15:04:05');
    });

    it('accepts a bare SourceData, which is what older exports and the db-bk backups are', () => {
        const { data, meta } = unwrapImportPayload(emptyData);
        expect(data).toStrictEqual(emptyData);
        expect(meta).toStrictEqual({});
    });

    it('does not mistake a corrupt file for an empty export', () => {
        // `data` alone is not the marker: recognising it by shape would turn
        // every broken file into "valid, but empty" and wipe the user's data on
        // the next import. Only the `format` field means "this is ours".
        const { data } = unwrapImportPayload({ data: emptyData });
        expect(data).toStrictEqual({ data: emptyData });
    });

    it('passes through anything that is not an object for the validator to reject', () => {
        expect(unwrapImportPayload('nope').data).toBe('nope');
        expect(unwrapImportPayload(null).data).toBe(null);
        expect(unwrapImportPayload([1, 2]).data).toStrictEqual([1, 2]);
    });

    it('drops header fields of the wrong type instead of trusting them', () => {
        const { meta } = unwrapImportPayload({
            format: EXPORT_FORMAT,
            data: emptyData,
            exportedAt: 'yesterday',
            exportedAtText: 42,
        });
        expect(meta).toStrictEqual({ exportedAt: undefined, exportedAtText: undefined });
    });
});
