jest.mock('electron', () => ({ shell: { openPath: jest.fn() } }));
jest.mock('./config', () => ({ dataDir: '/tmp/pomodoro-logger-data' }));

import { openDataDir } from './openDataDir';

const openPath = require('electron').shell.openPath as jest.Mock;

describe('openDataDir', () => {
    beforeEach(() => {
        openPath.mockReset();
    });

    it('shows the folder that holds the databases and screenshots', async () => {
        openPath.mockResolvedValue('');

        await openDataDir();

        expect(openPath).toHaveBeenCalledWith('/tmp/pomodoro-logger-data');
    });

    it('turns the message shell returns into an error the renderer can report', async () => {
        openPath.mockResolvedValue('Failed to open the folder');

        await expect(openDataDir()).rejects.toThrow('Failed to open the folder');
    });
});
