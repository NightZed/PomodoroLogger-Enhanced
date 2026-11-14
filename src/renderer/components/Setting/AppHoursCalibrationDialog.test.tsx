import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppHoursCalibrationDialog } from './AppHoursCalibrationDialog';
import type { SessionHourEntry, SessionHoursReport } from '../../../shared/sessionHours';

const mockToast = jest.fn();
const mockAlert = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../feedback', () => ({
    feedback: {
        toast: (...args: any[]) => mockToast(...args),
        alert: (...args: any[]) => mockAlert(...args),
        confirm: (...args: any[]) => mockConfirm(...args),
        notice: jest.fn(),
    },
}));

const entry = (
    sessionId: string,
    startTime: number,
    sessionHours: number,
    appHours: number,
    deltaSeconds: number
): SessionHourEntry => ({ sessionId, startTime, sessionHours, appHours, deltaSeconds });

const report: SessionHoursReport = {
    over: {
        total: 2,
        totalDeltaSeconds: 3960,
        preview: [entry('s2', 2000, 1, 2, 3600), entry('s1', 1000, 1, 1.1, 360)],
    },
    under: {
        total: 1,
        totalDeltaSeconds: 360,
        preview: [entry('s3', 3000, 1, 0.9, -360)],
    },
    missing: {
        total: 1,
        totalDeltaSeconds: 3600,
        preview: [entry('s4', 4000, 1, 0, 3600)],
    },
};

const scanSessionHours = jest.fn();
const recalibrateSessionHours = jest.fn();
const onClose = jest.fn();
const onRepaired = jest.fn();

beforeEach(() => {
    mockToast.mockClear();
    mockAlert.mockClear();
    mockConfirm.mockClear();
    onClose.mockClear();
    onRepaired.mockClear();
    scanSessionHours.mockReset();
    recalibrateSessionHours.mockReset();
    scanSessionHours.mockResolvedValue(report);
    recalibrateSessionHours.mockResolvedValue({ repaired: 2, skipped: 0 });
    (window as any).api = { scanSessionHours, recalibrateSessionHours };
});

const renderDialog = (value: SessionHoursReport = report) => {
    scanSessionHours.mockResolvedValue(value);
    const view = render(
        <AppHoursCalibrationDialog open onClose={onClose} onRepaired={onRepaired} />
    );
    return view;
};

/** Lets the scan promise settle inside `act`, like the real IPC round-trip. */
const flushScan = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

describe('AppHoursCalibrationDialog', () => {
    it('previews each group with the session id and starts with only `over` checked', async () => {
        renderDialog();
        await flushScan();

        expect(await screen.findByText('s2')).toBeTruthy();
        expect(screen.getByText('s1')).toBeTruthy();
        expect(screen.getByText('s3')).toBeTruthy();
        expect(screen.getByText('s4')).toBeTruthy();

        const [over, under] = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(over.checked).toBe(true);
        expect(under.checked).toBe(false);
    });

    it('counts the selected groups in the apply button', async () => {
        renderDialog();
        await flushScan();
        await screen.findByText('s2');

        expect(screen.getByRole('button', { name: /calibrate 2/i })).toBeTruthy();

        fireEvent.click(screen.getAllByRole('checkbox')[1]);

        expect(screen.getByRole('button', { name: /calibrate 3/i })).toBeTruthy();
    });

    it('calibrates the selected groups and reloads the store', async () => {
        renderDialog();
        await flushScan();
        await screen.findByText('s2');

        fireEvent.click(screen.getByRole('button', { name: /calibrate 2/i }));
        expect(mockConfirm).toHaveBeenCalledTimes(1);

        const config = mockConfirm.mock.calls[0][0];
        await act(async () => {
            await config.onOk();
        });

        expect(recalibrateSessionHours).toHaveBeenCalledWith({ over: true, under: false });
        expect(mockToast).toHaveBeenCalled();
        expect(onRepaired).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('treats a completely calibrated database as empty', async () => {
        const empty: SessionHoursReport = {
            over: { total: 0, totalDeltaSeconds: 0, preview: [] },
            under: { total: 0, totalDeltaSeconds: 0, preview: [] },
            missing: { total: 0, totalDeltaSeconds: 0, preview: [] },
        };
        scanSessionHours.mockResolvedValue(empty);
        render(<AppHoursCalibrationDialog open onClose={onClose} onRepaired={onRepaired} />);
        await flushScan();

        expect(await screen.findByText(/already adds up/i)).toBeTruthy();
    });

    it('reports a scan failure instead of showing an empty dialog', async () => {
        scanSessionHours.mockRejectedValue(new Error('db is locked'));
        render(<AppHoursCalibrationDialog open onClose={onClose} onRepaired={onRepaired} />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].content).toContain('db is locked');
    });
});
