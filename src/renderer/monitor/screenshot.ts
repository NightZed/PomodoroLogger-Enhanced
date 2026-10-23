/**
 * `desktopCapturer` and `screen` are main-process APIs since Electron 17, so the
 * main process resolves which capture source belongs to the display that hosts
 * the window (see `IpcEventName.DesktopSource`). It reads the window bounds
 * itself; no renderer-side remote/window access is involved.
 */
const getDesktopSource = async (): Promise<{ id: string; display_id: string } | undefined> =>
    window.api.desktopSource();

function getScreenCallback(
    maxSize: number | undefined,
    callback: (err?: Error, canvas?: HTMLCanvasElement) => void
) {
    const handleStream = (stream: MediaStream) => {
        const video = document.createElement('video');
        video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
        // Event connected to stream

        let loaded = false;
        video.onloadedmetadata = () => {
            if (loaded) {
                return;
            }

            video.pause();
            loaded = true;
            // Set video ORIGINAL height (screenshot)
            video.style.height = video.videoHeight + 'px'; // videoHeight
            video.style.width = video.videoWidth + 'px'; // videoWidth

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Cannot acquire context 2d');
            }
            // Draw video on canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            callback(undefined, canvas);
            // Remove hidden video tag
            video.remove();
            try {
                stream.getTracks()[0].stop();
            } catch (e) {
                // nothing
            }
        };

        video.srcObject = stream;
        video.play();
        document.body.appendChild(video);
    };

    const handleError = (e: Error) => {
        console.error(e);
        callback(e);
    };

    if (window.api.platform === 'win32') {
        getDesktopSource()
            .then((source) => {
                if (!source) {
                    throw new Error('Cannot find a desktop capture source for the current screen');
                }

                return navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        // @ts-ignore
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id + '',
                            // minWidth: 3,
                            // minHeight: 3,
                            // maxWidth: maxSize,
                            // maxHeight: maxSize
                        },
                    },
                });
            })
            .then((stream) => {
                handleStream(stream);
            })
            .catch(handleError);
    } else {
        navigator.mediaDevices
            .getUserMedia({
                audio: false,
                video: {
                    // @ts-ignore
                    mandatory: {
                        chromeMediaSource: 'screen',
                        maxWidth: 1920,
                        maxHeight: 1080,
                    },
                },
            })
            .then((event: any) => {
                handleStream(event);
            })
            .catch((err: Error) => {
                console.trace(err);
                handleError(err);
            });
    }
}

export async function getScreen(
    timeout: number = 500,
    maxSize: number | undefined = 1024
): Promise<string> {
    return await new Promise((resolve, reject) => {
        let finished = false;
        getScreenCallback(maxSize, (err, canvas) => {
            if (err) {
                reject(err);
            } else if (!finished) {
                finished = true;
                if (!canvas) {
                    reject('Screenshot error');
                    return;
                }

                // The renderer only produces the image and hands it to the
                // main process; `screenshotDir` and fs never touch this side.
                const url = canvas.toDataURL('image/jpeg', 0.1);
                window.api.saveScreenshot(url).then(resolve).catch(reject);
            }
        });

        setTimeout(() => {
            if (!finished) {
                finished = true;
                console.log('timeout... reject screen shot');
                reject();
            }
        }, timeout);
    });
}
