import { DEFAULT_SOUND_URL, playSound, soundName, soundUrl } from './sound';

interface FakeAudio {
    src: string;
    volume: number;
    play: jest.Mock;
    pause: jest.Mock;
    addEventListener: jest.Mock;
}

let created: FakeAudio[];
let playImpl: () => Promise<void>;
let originalAudio: typeof Audio;

beforeEach(() => {
    created = [];
    playImpl = () => Promise.resolve();
    originalAudio = window.Audio;
    // jsdom has no media stack; the only thing this module does with an audio
    // element is create it, set its source and volume, and play it.
    (window as any).Audio = jest.fn((src: string) => {
        const audio: FakeAudio = {
            src,
            volume: 1,
            play: jest.fn(() => playImpl()),
            pause: jest.fn(),
            addEventListener: jest.fn(),
        };
        created.push(audio);
        return audio;
    });
});

afterEach(() => {
    (window as any).Audio = originalAudio;
});

describe('soundUrl', () => {
    it('uses the bundled chime when no file is chosen', () => {
        expect(soundUrl()).toBe(DEFAULT_SOUND_URL);
        expect(soundUrl('')).toBe(DEFAULT_SOUND_URL);
    });

    it('encodes the path so the main process can decode it', () => {
        const path = 'C:\\My Sounds\\雨声 & rain.mp3';
        expect(soundUrl(path)).toBe(`sound://local?path=${encodeURIComponent(path)}`);
    });
});

describe('soundName', () => {
    it('returns the file name of a windows path', () => {
        expect(soundName('C:\\sounds\\rain.mp3')).toBe('rain.mp3');
    });

    it('returns the file name of a unix path', () => {
        expect(soundName('/home/me/rain.wav')).toBe('rain.wav');
    });
});

describe('playSound', () => {
    it('plays the chosen file at the given volume', () => {
        playSound('C:\\rain.mp3', 0.3);

        expect(created).toHaveLength(1);
        expect(created[0].src).toBe(soundUrl('C:\\rain.mp3'));
        expect(created[0].volume).toBe(0.3);
        expect(created[0].play).toHaveBeenCalled();
    });

    it('clamps the volume into 0..1', () => {
        playSound(undefined, 2);
        playSound(undefined, -1);

        expect(created[0].volume).toBe(1);
        expect(created[1].volume).toBe(0);
    });

    it('stops the reminder that is still playing', () => {
        playSound(undefined, 0.5);
        playSound(undefined, 0.5);

        expect(created[0].pause).toHaveBeenCalled();
        expect(created[1].pause).not.toHaveBeenCalled();
    });

    it('rejects when the file cannot be played', async () => {
        playImpl = () => Promise.reject(new Error('decode failed'));

        await expect(playSound('C:\\missing.mp3', 0.5)).rejects.toThrow('decode failed');
    });
});
