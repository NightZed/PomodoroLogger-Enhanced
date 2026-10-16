import AppIcon from '../../../res/icon.png';
import { ipcRenderer } from 'electron';
import { IpcEventName } from '../../../main/ipc/type';

function drawText(ctx: CanvasRenderingContext2D, isMac: boolean, size: number, leftTime: string) {
    // #dcdcdc (user picked it over the brighter #fff tried before) ...
    ctx.fillStyle = '#dcdcdc';
    // ... and 0.66x size instead of the old 0.8x: "two digits + margin" is
    // decided by glyph width alone (both digits sit on the dial centre), and
    // at 0.8x the number came out ~14px wide on a 16px dial -- edge to edge.
    // 0.66x leaves ~2px of dial on each side without moving the text.
    ctx.font = `${size * 0.66}px Helvetica, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leftTime, size / 2, isMac ? size / 2 : (size / 9) * 5);
}

function drawConfirm(ctx: CanvasRenderingContext2D, isFocusing: boolean, size: number) {
    // Mirrors MiniLogger's confirming dial: the disc keeps the START color of
    // the session that just finished (focus red / break navy) and the time
    // text becomes the session fruit (tomato after focus, grapes after break).
    // Static (no ConfirmSweep rotation): the tray icon is a single PNG, so
    // there is no animation channel -- the fruit on the session disc is what
    // distinguishes "waiting for confirm" from running/paused/idle.
    ctx.fillStyle = isFocusing ? '#e84545' : '#2b2e4a';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${
        size * 0.62
    }px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isFocusing ? '🍅' : '🍇', size / 2, size / 2 + size * 0.03);
}

function drawPausedDim(ctx: CanvasRenderingContext2D, size: number) {
    // Mirrors MiniLogger's `.timer-svg.is-paused` (opacity 0.62 + desaturated):
    // keep the focus/break disc + progress + position, only dim the whole dial.
    // Canvas has no saturate(), so a translucent black disc approximates it.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
}

function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

/**
 * Centered pause badge for a paused-with-session tray icon. The countdown text
 * keeps its running-state position/size (see `drawText`) -- this badge simply
 * overlays the centre on top of it, so the remaining minutes peek out around
 * the pill edges. Deliberately mirrors MiniLogger's `.timer-paused-badge`
 * (dark pill + twin white bars), only recentered for the 16-logical-px tray
 * canvas (see `trayCanvasSize`).
 */
function drawPause(ctx: CanvasRenderingContext2D, size: number) {
    const cx = size / 2;
    const cy = size / 2;
    // Small centered pill: only covers the stroke intersection of the two
    // digits, leaving most of each digit visible around it.
    const pillW = size * 0.44;
    const pillH = size * 0.36;
    roundRectPath(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
    // 0.85 (not 0.72): at the real 16px display size the pill is only ~7px
    // wide, so it needs full contrast to keep the twin bars legible.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fill();
    // Twin bars centred in the pill.
    const barW = Math.max(2, size * 0.09);
    const barH = pillH * 0.56;
    const gap = Math.max(2, size * 0.09);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - gap / 2 - barW, cy - barH / 2, barW, barH);
    ctx.fillRect(cx + gap / 2, cy - barH / 2, barW, barH);
}

/**
 * Logical size of the tray icon in CSS pixels. Windows/macOS shells show the
 * tray entry at ~16 logical px; everything drawn for it is proportional to
 * this value, so one code path serves every DPI.
 */
const TRAY_LOGICAL_SIZE = 16;

/**
 * Physical pixel size of the canvas: logical size x display scale factor, so
 * the glyphs are hinted at the resolution they are SHOWN at (16px on a 100%
 * display, 32px on 200%). The old code always drew a 32px canvas and let the
 * shell downscale it to 16px, which is exactly the blur the mini window (an
 * SVG rasterized at the final size) does not have. "Vector-sharp" without a
 * vector tray API = rasterize at the final size.
 */
function trayCanvasSize(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    // Clamp: a 300%+ display would only cost pixels, and odd values (1.25)
    // are kept -- `nativeImage` accepts a fractional scaleFactor.
    const scale = Math.min(Math.max(dpr || 1, 1), 3);
    return Math.max(16, Math.round(TRAY_LOGICAL_SIZE * scale));
}

interface MadeIcon {
    src: string;
    /**
     * Scale factor the image was drawn at (`physical / 16`). The main process
     * declares it on the nativeImage, so the shell keeps the icon at 16
     * logical px and never re-scales it.
     */
    scaleFactor: number;
}

async function makeIcon(
    leftTime?: string,
    progress?: number,
    isFocus?: boolean,
    isPause?: boolean,
    isConfirming?: boolean
): Promise<MadeIcon> {
    const canvas = document.createElement('canvas');
    const size = trayCanvasSize();
    const scaleFactor = size / TRAY_LOGICAL_SIZE;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('cannot get context2d');
    }

    const img = document.createElement('img');
    return new Promise<MadeIcon>((resolve, reject) => {
        img.addEventListener('error', (e) => {
            console.error(e);
            reject(e);
        });
        img.addEventListener('load', () => {
            if (isConfirming) {
                // Session ended, waiting for confirm: session disc + fruit,
                // mirroring MiniLogger's confirming dial -- never the app icon.
                drawConfirm(ctx, !!isFocus, size);
            } else if (leftTime !== undefined) {
                // Running or paused-with-session: same session disc (focus red /
                // break navy + progress + minutes at the running position/size).
                // A pause only dims the dial and overlays a centered pause pill,
                // mirroring MiniLogger's `.timer-svg.is-paused` + badge -- so
                // the mode and the remaining time stay visible while paused.
                drawCircleProgress(ctx, !!isFocus, size, progress ?? 0);
                // The mac/windows text differs only in vertical centring; the
                // platform check moved here with the canvas size change.
                drawText(ctx, process.platform === 'darwin', size, leftTime);
                if (isPause) {
                    drawPausedDim(ctx, size);
                    drawPause(ctx, size);
                }
            } else {
                ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, size, size);
            }

            resolve({ src: canvas.toDataURL('image/png'), scaleFactor });
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

    // Base is the *other* session's color; the wedge fills clockwise with the
    // running session's own color, so a focus run starts navy, fills red, and
    // ends all-red -- exactly the disc `drawConfirm` (and MiniLogger's
    // confirming dial) keeps with the tomato on top. A break mirrors it
    // (red -> navy + grapes). The previous version had base/fill swapped
    // (red base + navy fill), so a finished focus run ended navy while the
    // confirming icon was red -- the mismatch reported.
    ctx.fillStyle = isFocusing ? breakColor : focusColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isFocusing ? focusColor : breakColor;

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
    isPause?: boolean,
    isConfirming?: boolean
) {
    const icon = await makeIcon(leftTime, progress, isFocus, isPause, isConfirming);
    // Payload is an object (not a bare dataURL) since 方案一: the main process
    // needs `scaleFactor` to declare the image at the DPI it was drawn for.
    ipcRenderer.send(IpcEventName.SetTray, icon);
}
