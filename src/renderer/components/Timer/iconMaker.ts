import AppIcon from '../../../res/icon.png';
import { ipcRenderer } from 'electron';
import { IpcEventName } from '../../../main/ipc/type';

function drawText(ctx: CanvasRenderingContext2D, isMac: boolean, size: number, leftTime: string) {
    ctx.fillStyle = '#dcdcdc';
    ctx.font = `${(size / 2.5) * 2}px Helvetica, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leftTime, size / 2, isMac ? size / 2 : (size / 9) * 5);
}

function drawPause(ctx: CanvasRenderingContext2D, size: number) {
    const side = size / Math.sqrt(2) / 1.3;
    const margin = (size - side) / 2;
    const padding = side / 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillRect(margin, margin, padding, side);
    ctx.fillRect(margin + padding * 2, margin, padding, side);
}

async function makeIcon(
    leftTime?: string,
    progress?: number,
    isFocus?: boolean,
    isPause?: boolean
): Promise<string> {
    const canvas = document.createElement('canvas');
    let size = 32;
    const isMac = process.platform === 'darwin';
    if (isMac) {
        size = 32;
    }

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('cannot get context2d');
    }

    const img = document.createElement('img');
    return new Promise<string>((resolve, reject) => {
        img.addEventListener('error', (e) => {
            console.error(e);
            reject(e);
        });
        img.addEventListener('load', (e) => {
            if (leftTime !== undefined && !isPause) {
                drawCircleProgress(ctx, !!isFocus, size, progress ?? 0);
                drawText(ctx, isMac, size, leftTime);
            } else {
                ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, size, size);
                if (isPause) {
                    drawPause(ctx, size);
                }
            }

            resolve(canvas.toDataURL('image/png'));
        });
        img.src = AppIcon;
    });
}

function drawCircleProgress(
    ctx: CanvasRenderingContext2D,
    isFocusing: boolean,
    size: number,
    progress: number
) {
    const focusColor = '#e84545';
    const breakColor = '#2b2e4a';

    ctx.fillStyle = isFocusing ? focusColor : breakColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isFocusing ? breakColor : focusColor;

    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(size / 2, 0);
    ctx.arc(size / 2, size / 2, size / 2, -Math.PI / 2, 2 * Math.PI * progress - Math.PI / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.closePath();
    ctx.fill();
}

export async function setTrayImageWithMadeIcon(
    leftTime?: string,
    progress?: number,
    isFocus?: boolean,
    isPause?: boolean
) {
    const src = await makeIcon(leftTime, progress, isFocus, isPause);
    ipcRenderer.send(IpcEventName.SetTray, src);
}
