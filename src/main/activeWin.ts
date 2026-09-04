import _activeWin from 'active-win';

let hasPermission = false;
let available = false;
export async function initActiveWin() {
    try {
        await _activeWin({ screenRecordingPermission: false, accessibilityPermission: false });
        available = true;
        await _activeWin({ screenRecordingPermission: true, accessibilityPermission: true });
        hasPermission = true;
    } catch (e) {
        console.error('activeWin init error:', e);
    }

    console.log('Initialized with activeWin?', available);
    console.log('Initialized with activeWin title permission?', hasPermission);
}

export async function activeWin() {
    if (!available) {
        return;
    }

    return await _activeWin({
        screenRecordingPermission: hasPermission,
        accessibilityPermission: hasPermission,
    });
}
