import { setTrayImageWithMadeIcon } from './iconMaker';

const originalCreateElement = document.createElement.bind(document);
let context: any;
let canvasWidth = 0;
let imgNaturalWidth = 16;
let imgNaturalHeight = 16;
let failImageLoad = false;
const loadHandlers: Function[] = [];
const errorHandlers: Function[] = [];

const fillText = jest.fn();
const fillRect = jest.fn();
const drawImage = jest.fn();
const originalDpr = window.devicePixelRatio;

function installCanvas() {
    context = {
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        beginPath: jest.fn(),
        closePath: jest.fn(),
        fill: jest.fn(),
        arc: jest.fn(),
        arcTo: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        fillRect,
        fillText,
        drawImage,
    };

    jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        if (tag === 'canvas') {
            return {
                height: 0,
                getContext: () => context ?? null,
                toDataURL: () => 'data:image/png;base64,icon',
                get width() {
                    return canvasWidth;
                },
                set width(value: number) {
                    canvasWidth = value;
                },
            } as any;
        }

        if (tag === 'img') {
            const img: any = {
                naturalWidth: imgNaturalWidth,
                naturalHeight: imgNaturalHeight,
                addEventListener: (type: string, handler: Function) => {
                    (type === 'load' ? loadHandlers : errorHandlers).push(handler);
                },
            };
            Object.defineProperty(img, 'src', {
                set() {
                    if (failImageLoad) {
                        errorHandlers.forEach((handler) => handler(new Event('error')));
                    } else {
                        loadHandlers.forEach((handler) => handler());
                    }
                },
            });
            return img;
        }

        return originalCreateElement(tag);
    }) as any);
}

function setApi(platform: string) {
    const setTrayImage = jest.fn();
    (window as any).api = { ...(window as any).api, platform, setTrayImage };
    return setTrayImage;
}

describe('Timer iconMaker', () => {
    beforeEach(() => {
        context = undefined;
        canvasWidth = 0;
        imgNaturalWidth = 16;
        imgNaturalHeight = 16;
        failImageLoad = false;
        loadHandlers.length = 0;
        errorHandlers.length = 0;
        fillText.mockClear();
        fillRect.mockClear();
        drawImage.mockClear();
        installCanvas();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: originalDpr,
        });
    });

    it('draws the app icon while idle', async () => {
        const setTrayImage = setApi('win32');

        await setTrayImageWithMadeIcon();

        expect(drawImage).toHaveBeenCalled();
        expect(setTrayImage).toHaveBeenCalledWith({
            src: 'data:image/png;base64,icon',
            scaleFactor: 1,
        });
    });

    it('draws the remaining minutes and progress while running', async () => {
        const setTrayImage = setApi('win32');
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

        await setTrayImageWithMadeIcon('12', 0.5, true, false);

        expect(fillText).toHaveBeenCalledWith('12', 16, (32 / 9) * 5);
        expect(setTrayImage).toHaveBeenCalledWith({
            src: 'data:image/png;base64,icon',
            scaleFactor: 2,
        });
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('centers the text vertically on macOS', async () => {
        setApi('darwin');

        await setTrayImageWithMadeIcon('12', 0.5, false, false);

        expect(fillText).toHaveBeenCalledWith('12', 8, 8);
    });

    it('adds the pause badge while paused', async () => {
        setApi('win32');

        await setTrayImageWithMadeIcon('08', 0.25, true, true);

        expect(fillRect).toHaveBeenCalledTimes(2);
    });

    it('draws the session fruit while waiting for confirmation', async () => {
        setApi('win32');

        await setTrayImageWithMadeIcon(undefined, undefined, true, false, true);

        expect(fillText).toHaveBeenCalledWith(expect.any(String), 8, 8 + 16 * 0.03);
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('clamps the canvas scale to 1..3', async () => {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 5 });
        let setTrayImage = setApi('win32');

        await setTrayImageWithMadeIcon('01', 0, true);
        expect(setTrayImage).toHaveBeenCalledWith(expect.objectContaining({ scaleFactor: 3 }));

        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
        setTrayImage = setApi('win32');
        await setTrayImageWithMadeIcon('01', 0, true);
        expect(setTrayImage).toHaveBeenCalledWith(expect.objectContaining({ scaleFactor: 1 }));
    });

    it('rejects when the canvas context is unavailable', async () => {
        setApi('win32');
        context = null;

        await expect(setTrayImageWithMadeIcon()).rejects.toThrow('cannot get context2d');
    });

    it('rejects and logs when the app icon cannot load', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        setApi('win32');
        failImageLoad = true;

        await expect(setTrayImageWithMadeIcon()).rejects.toBeDefined();
        expect(consoleError).toHaveBeenCalled();
    });
});
