import { dialog } from 'electron';
import { existsSync } from 'fs';
import { DBs } from './db';
import { showOpenFileDialog } from './fileDialog';

jest.mock('electron', () => ({ dialog: { showOpenDialog: jest.fn() } }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('./log', () => ({ log: jest.fn() }));

const showOpenDialog = dialog.showOpenDialog as jest.Mock;
const dirExists = existsSync as jest.Mock;

/** The remembered folders as they actually landed in the settings table. */
const storedDirs = async () => (await DBs.settingDB.findOne({ name: 'setting' }))?.fileDialogDirs;
const rememberDirs = (fileDialogDirs: Record<string, string>) =>
    DBs.settingDB.update({ name: 'setting' }, { $set: { fileDialogDirs } }, { upsert: true });

beforeEach(async () => {
    jest.clearAllMocks();
    dirExists.mockReturnValue(true);
    await DBs.settingDB.remove({});
});

afterEach(() => {
    jest.restoreAllMocks();
});

it('opens at the system default when that kind has no folder yet', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await showOpenFileDialog({ filters: [] }, 'sound');

    expect(showOpenDialog).toHaveBeenCalledWith({ filters: [], defaultPath: undefined });
});

it('opens in the folder remembered for that kind', async () => {
    await rememberDirs({ sound: '/tmp/sounds', wallpaper: '/tmp/walls' });
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await showOpenFileDialog({}, 'wallpaper');

    expect(showOpenDialog).toHaveBeenCalledWith({ defaultPath: '/tmp/walls' });
});

it('does not fall back to another kind of pick', async () => {
    await rememberDirs({ sound: '/tmp/sounds' });
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await showOpenFileDialog({}, 'import');

    expect(showOpenDialog).toHaveBeenCalledWith({ defaultPath: undefined });
});

it('remembers the folder of the picked file for that kind only', async () => {
    await rememberDirs({ wallpaper: '/tmp/walls' });
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/sounds/rain.mp3'] });

    await showOpenFileDialog({}, 'sound');

    expect(await storedDirs()).toEqual({ wallpaper: '/tmp/walls', sound: '/tmp/sounds' });
});

it('leaves the memory alone when the dialog was cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await showOpenFileDialog({}, 'sound');

    expect(await storedDirs()).toBeUndefined();
});

it('ignores a remembered folder that no longer exists', async () => {
    await rememberDirs({ sound: '/tmp/gone' });
    dirExists.mockReturnValue(false);
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await showOpenFileDialog({}, 'sound');

    expect(showOpenDialog).toHaveBeenCalledWith({ defaultPath: undefined });
});

it('still returns the pick when the folder cannot be written', async () => {
    jest.spyOn(DBs.settingDB, 'update').mockRejectedValueOnce(new Error('disk full'));
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/sounds/rain.mp3'] });

    await expect(showOpenFileDialog({}, 'sound')).resolves.toEqual({
        canceled: false,
        filePaths: ['/tmp/sounds/rain.mp3'],
    });
});
