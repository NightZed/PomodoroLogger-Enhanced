import * as React from 'react';
import { DAY_TREEMAP_COLORS, NIGHT_TREEMAP_COLORS, ThemeTokens } from '../../renderer/theme/tokens';
import { useThemeTokens } from '../../renderer/theme/useThemeTokens';

/** The minimum a board has to expose to take part in the project palette. */
export interface ProjectColorBoard {
    name: string;
    createdTime?: number;
}

/**
 * Kept structural instead of importing `KanbanBoardState`: this module sits in
 * the shared visualisation library, and the History page, the Timer page and
 * their tests all pass their own board maps.
 */
export type ProjectColorSource = {
    readonly [boardId: string]: ProjectColorBoard | undefined;
};

export type ProjectColorOf = (projectName: string | undefined) => string;

/**
 * One stable color per project name for the whole app.
 *
 * The treemap used to color blocks by their position in the value-sorted list,
 * so a project changed color as soon as it gained or lost hours; the timeline
 * next to it would then disagree with the block above. Both now resolve through
 * this function: boards are ordered by creation time (name breaks the tie, so
 * boards stored without `createdTime` still land in a stable order) and take
 * palette slots in that order. A new board only appends, so colors already on
 * screen never move.
 *
 * Keyed by name rather than id because the aggregated treemap data only carries
 * names (`aggPomodoro.ts` resolves board ids before handing them over). Two
 * boards sharing a name therefore share a color, which is also how they already
 * look in the treemap.
 */
export function createProjectColorOf(
    boards: ProjectColorSource | undefined,
    tokens: ThemeTokens
): ProjectColorOf {
    const palette =
        tokens.treemapColors ??
        (tokens.base === 'dark' ? NIGHT_TREEMAP_COLORS : DAY_TREEMAP_COLORS);
    const colors = new Map<string, string>();

    if (boards !== undefined) {
        const ordered = Object.values(boards)
            .filter((board): board is ProjectColorBoard => board != null)
            .sort(
                (a, b) =>
                    (a.createdTime ?? 0) - (b.createdTime ?? 0) || a.name.localeCompare(b.name)
            );
        for (const board of ordered) {
            if (colors.has(board.name)) {
                continue;
            }
            // `size` instead of the loop index: a duplicated name must not eat a
            // palette slot, or every project after it would shift.
            colors.set(board.name, palette[colors.size % palette.length]);
        }
    }

    // Unassigned sessions and sessions of a deleted board share one neutral
    // fill; the treemap already calls both of them "Unknown".
    return (projectName) =>
        projectName === undefined
            ? tokens.textTertiary
            : (colors.get(projectName) ?? tokens.textTertiary);
}

/** Theme-aware variant for components that render the color directly. */
export function useProjectColors(boards: ProjectColorSource | undefined): ProjectColorOf {
    const { tokens } = useThemeTokens();
    return React.useMemo(() => createProjectColorOf(boards, tokens), [boards, tokens]);
}
