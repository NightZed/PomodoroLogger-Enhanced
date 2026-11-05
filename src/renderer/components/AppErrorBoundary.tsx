import * as React from 'react';
import ErrorScreen from './ErrorScreen';
import { reportRendererError } from '../errorReporting';

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
    componentStack: string | null;
}

/**
 * The outermost React boundary, wrapping `<Application />` in `app.tsx`.
 *
 * It has to sit *outside* `Application`: when that component's own render
 * throws, React unmounts its whole tree, and a boundary inside it would have
 * nothing left to render. This one keeps the theme and language controllers
 * (its siblings) mounted and replaces only the app with the error page.
 *
 * It never restarts the app. A restart is a decision for the user, made on the
 * error page -- the previous behaviour (restart after three seconds, leaving no
 * trace of the error) is exactly what this replaces.
 */
export default class AppErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null, componentStack: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        removeSplash();
        this.setState({ componentStack: info.componentStack ?? null });
        reportRendererError('react', error, { componentStack: info.componentStack });
    }

    render(): React.ReactNode {
        if (this.state.error) {
            return (
                <ErrorScreen error={this.state.error} componentStack={this.state.componentStack} />
            );
        }

        return this.props.children;
    }
}

/**
 * The splash screen lives next to `#root` and is removed by `app.tsx` after a
 * timer. If the first render fails, that timer would leave it covering the
 * error page for seconds (and removing an already-removed node would throw
 * again), so the boundary drops it immediately.
 */
export function removeSplash(): void {
    try {
        document.getElementById('logo-container')?.remove();
    } catch {
        // Nothing to remove.
    }
}
