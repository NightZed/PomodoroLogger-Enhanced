import dingMp3 from '../res/ding.mp3';

/**
 * The chime that ships with the app, used whenever a reminder setting has no
 * file of its own.
 */
export const DEFAULT_SOUND_URL = dingMp3;

/**
 * URL an `<audio>` element can load for `path`.
 *
 * A chosen file lives outside the app bundle, so it cannot be referenced
 * directly: the renderer is sandboxed and the CSP only allows `media-src
 * 'self' blob: sound:`. The main process registers that `sound:` scheme (see
 * `init.ts`) and simply streams the absolute path it is given -- the same
 * arrangement the wallpaper uses.
 */
export function soundUrl(path?: string): string {
    return path ? `sound://local?path=${encodeURIComponent(path)}` : DEFAULT_SOUND_URL;
}

/** The file's own name for the settings row; the full path goes in the title. */
export function soundName(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
}

/**
 * The element of the sound that is currently playing.
 *
 * It is held here rather than left to the caller because an `HTMLAudioElement`
 * that nothing references can be collected before it reaches its end, which
 * cuts the sound off.
 */
let playing: HTMLAudioElement | undefined;

/**
 * Plays one reminder sound at `volume` (0..1).
 *
 * The returned promise rejects when the file is gone, unreadable or a format
 * Chromium cannot decode; callers decide what to do about it (the Timer falls
 * back to the bundled chime, the settings page reports it).
 */
export function playSound(path?: string, volume = 0.5): Promise<void> {
    // Only one reminder is ever meant to be heard at a time; the second chime
    // of a finished session must not overlap the first.
    playing?.pause();

    const audio = new Audio(soundUrl(path));
    playing = audio;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.addEventListener(
        'ended',
        () => {
            if (playing === audio) {
                playing = undefined;
            }
        },
        { once: true }
    );

    return audio.play();
}
