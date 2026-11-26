import { AntdIcon as Icon } from '../../../renderer/components/antdIcon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

import { SearchPanel } from './SearchPanel';
import { isEditableTarget } from '../../../shared/keyboard';
import { useI18n } from '../../../renderer/i18n';
import { pressable } from '../pressable';
import { Hint } from '../Hint/Hint';

export interface SearchProps {
    searchStr?: string;
    tags?: () => string[];
    searchHistory?: () => string[];
    setSearchStr(str: string): void;
    /**
     * Regex mode, plus the callback that toggles it. The pair is optional: a
     * bar that matches plain substrings (the overview's board-name filter)
     * omits it and shows no toggle at all.
     */
    regex?: boolean;
    onRegexToggle?(enabled: boolean): void;
    /** The current query does not compile as a regular expression. */
    regexInvalid?: boolean;
    /**
     * Whether the page this bar belongs to is the active one. The Kanban page
     * stays mounted for `DestroyOnTimeoutWrapper`'s 10-minute grace after a
     * tab switch (its pane merely hidden -- and hidden DOM does not stop
     * document-level listeners), so without this the Ctrl+F below would keep
     * hijacking the keystroke on every other page. Defaults to true for
     * callers that render it unconditionally.
     */
    enabled?: boolean;
}

interface StyledProps {
    $isSearching: boolean;
    $showPanel: boolean;
    $invalidRegex: boolean;
}

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
`;

const StyledSearch = styled.div<StyledProps>`
    font-size: 0.9rem;
    background-color: var(--pl-bg-elevated);
    margin: 0 4px;
    box-sizing: border-box;
    padding: 5px;
    height: 32px;
    border-radius: 16px;
    transition:
        width 200ms,
        padding 200ms;
    border: 1px solid var(--pl-border);
    outline: none;
    color: var(--pl-text);
    z-index: 5;

    ${({ $isSearching }) =>
        $isSearching
            ? `
        width: 250px; 
        padding: 5px 12px;
        `
            : `width: 32px; 
        cursor: pointer;
        input, .close, .regex-toggle { display: none;}
    `}

    ${({ $showPanel, $isSearching }) => ($isSearching && $showPanel ? `height: auto;` : ``)}

    header {
        display: flex;
        flex-direction: row;
        align-items: center;

        i {
            font-size: 20px;
            width: 20px;
            height: 20px;
            outline: none;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .close {
            box-sizing: border-box;
            padding: 4px;
            cursor: pointer;
            border-radius: 10px;
            z-index: 6;
            transition:
                background-color 300ms,
                opacity 200ms;
            animation: ${fadeIn} 300ms ease;

            &:hover {
                background-color: var(--pl-bg-hover);
            }
        }

        input {
            width: 140px;
            /* Flex items default to min-width: auto, which is the input's
               intrinsic width (~20 characters). With the extra regex toggle
               the row no longer fits in 250px, and the input refused to
               shrink: the close icon was pushed onto/past the right edge.
               Allowing it to shrink keeps the icons inside the bar. */
            min-width: 0;
            background: transparent;
            color: var(--pl-text);
            flex-grow: 1;
            border: none;
            outline: none;
            margin: 0 6px;
            padding: 0;
            line-height: 20px;
            height: 20px;
        }

        .regex-toggle {
            flex: 0 0 auto;
            box-sizing: border-box;
            min-width: 20px;
            height: 20px;
            padding: 0 2px;
            border: none;
            border-radius: 4px;
            background: transparent;
            color: var(--pl-text-secondary);
            font-family: monospace;
            font-size: 12px;
            line-height: 20px;
            cursor: pointer;

            &[aria-pressed='true'] {
                color: var(--pl-primary);
                background-color: var(--pl-bg-hover);
            }

            &:hover {
                background-color: var(--pl-bg-hover);
            }

            &:focus-visible {
                outline: 2px solid var(--pl-primary);
                outline-offset: 2px;
            }
        }
    }

    /* Visually hidden, still announced: the invalid-regex state changes without
       moving focus, so it needs an aria-live node. */
    .regex-invalid {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    &:focus,
    &:focus-within {
        border: 1px solid var(--pl-primary);
    }
    &:hover {
        border: 1px solid var(--pl-primary);
    }

    ${({ $invalidRegex }) =>
        $invalidRegex
            ? `
        &, &:hover, &:focus, &:focus-within {
            border-color: #ff4d4f;
        }
    `
            : ``}
`;

export const Search = ({
    setSearchStr,
    searchHistory,
    searchStr,
    tags,
    enabled = true,
    regex = false,
    onRegexToggle,
    regexInvalid = false,
}: SearchProps) => {
    const { t } = useI18n();
    const [isSearching, setIsSearching] = useState(false);
    const [text, setText] = useState('');
    const [showPanel, setShowPanel] = useState(false);
    const textRef = useRef<string>('');
    const selfRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const onClick = useCallback(() => {
        if (!isSearching) {
            setIsSearching(true);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 200);
        }
    }, [isSearching]);

    useEffect(() => {
        if (searchStr == null || searchStr === textRef.current) {
            return;
        }

        setText(searchStr);
        textRef.current = searchStr;
        setIsSearching(true);
    }, [searchStr]);

    useEffect(() => {
        if (enabled) {
            return;
        }

        // The page that owns this bar is no longer active. Its owner clears
        // the store filter (see Kanban); drop the local text too, otherwise
        // coming back would show a stale query over an unfiltered board.
        // `searchStr == null` cannot be used for this: while the user types,
        // the debounced store update legitimately lags behind the input.
        setText('');
        textRef.current = '';
        setIsSearching(false);
        setShowPanel(false);
    }, [enabled]);

    const clear = useCallback(
        (event: React.MouseEvent) => {
            event.stopPropagation();
            setIsSearching(false);
            setShowPanel(false);
            setText('');
            textRef.current = '';
            setSearchStr('');
        },
        [setSearchStr]
    );

    const search = useCallback(
        (value: string) => {
            setText(value);
            textRef.current = value;
            setSearchStr(value);
        },
        [setSearchStr]
    );

    const onChange = useCallback(
        (v: React.ChangeEvent<HTMLInputElement>) => {
            const value = v.target.value;
            search(value);
        },
        [search]
    );

    const onKeydown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === 'Escape' || event.keyCode === 27) {
                setText('');
                textRef.current = '';
                setSearchStr('');
                setIsSearching(false);
                setShowPanel(false);
            } else if (event.key === 'Enter' || event.keyCode === 13) {
                inputRef.current?.blur();
            }
        },
        [setSearchStr]
    );

    useEffect(() => {
        if (!enabled) {
            // The page this bar belongs to is not the active one (it stays
            // mounted for the wrapper's grace after a tab switch, and hidden
            // DOM does not stop window-level listeners): register nothing.
            // The state is kept, so returning to the page restores the bar.
            return undefined;
        }

        const handler = (e: MouseEvent) => {
            if (!selfRef.current) {
                return;
            }

            if (selfRef.current.contains(e.target as Element)) {
                return;
            }

            if (!textRef.current) {
                setIsSearching(false);
            }

            setShowPanel(false);
        };

        const onKeydown = (e: KeyboardEvent) => {
            // Never hijack typing: with the caret in a text field (the card
            // editor's title/description a.o.) Ctrl+F belongs to the field,
            // not to this bar -- stealing the focus there would silently
            // redirect the user's next keystrokes into the search box.
            if (isEditableTarget(e.target)) {
                return;
            }

            if ((e.key === 'f' || e.keyCode === 70) && e.ctrlKey) {
                e.preventDefault();
                setIsSearching(true);
                inputRef.current?.focus();
            }
        };

        window.addEventListener('mousedown', handler);
        window.addEventListener('keydown', onKeydown);
        return () => {
            window.removeEventListener('mousedown', handler);
            window.removeEventListener('keydown', onKeydown);
        };
    }, [enabled]);

    const togglePanel = useCallback(() => {
        setShowPanel((v) => !v);
    }, []);

    // `tags()` walks every card of the board and extracts its content tags.
    // It used to be called from the JSX on every Search render, so each
    // keystroke in the search box re-parsed every card while the panel was
    // open. Compute the panel data only when the panel is actually shown and
    // the underlying board data (the callback identity) changes.
    const tagList = React.useMemo(
        () => (showPanel && isSearching && tags ? tags() : undefined),
        [showPanel, isSearching, tags]
    );
    const historyList = React.useMemo(
        () => (showPanel && isSearching && searchHistory ? searchHistory() : undefined),
        [showPanel, isSearching, searchHistory]
    );
    // A bar without suggestions (the overview's board-name filter) must not
    // offer a toggle: opening it would show an empty card with no content.
    const hasPanelContent = Boolean(tags || searchHistory);
    const panel = React.useMemo(
        () =>
            hasPanelContent && showPanel && isSearching ? (
                <SearchPanel tags={tagList} history={historyList} search={search} />
            ) : null,
        [hasPanelContent, showPanel, isSearching, tagList, historyList, search]
    );
    // The regex control only exists while the bar is open. Its aria-label
    // describes the action (turn on / turn off) and `aria-pressed` carries the
    // state; the hover hint stays a fixed noun so the text does not change
    // under the pointer when the button is clicked.
    const invalidRegex = Boolean(onRegexToggle && isSearching && regexInvalid);
    const regexLabel = regex ? t('search.regexOff') : t('search.regexOn');

    return (
        <StyledSearch
            // Collapsed, the whole bar is the control that opens the input:
            // give it a button role so it can be reached and activated from
            // the keyboard like the icons inside it. Expanded, the bar is a
            // plain container -- a button role would swallow Space in the
            // input through its Enter/Space forwarding.
            {...(isSearching
                ? { onKeyDown: onKeydown }
                : { ...pressable(), 'aria-label': t('search.label') })}
            $isSearching={isSearching}
            $showPanel={showPanel}
            $invalidRegex={invalidRegex}
            onClick={onClick}
            ref={selfRef}
        >
            <header>
                <Icon type="search" style={{ padding: 1 }} />
                <input
                    ref={inputRef}
                    onChange={onChange}
                    value={text}
                    aria-label={t('search.label')}
                    aria-invalid={invalidRegex || undefined}
                />
                {hasPanelContent ? (
                    <Icon
                        type={'down'}
                        style={{
                            transform: showPanel ? 'rotate(180deg)' : '',
                            transition: 'transform 120ms',
                        }}
                        className="close"
                        aria-label={t('search.expand')}
                        onClick={togglePanel}
                        {...pressable()}
                    />
                ) : null}
                {onRegexToggle ? (
                    <Hint kind="static" label={t('search.regex')}>
                        <button
                            type="button"
                            className="regex-toggle"
                            aria-label={regexLabel}
                            aria-pressed={regex}
                            onClick={() => onRegexToggle(!regex)}
                        >
                            .*
                        </button>
                    </Hint>
                ) : null}
                <Icon
                    type="close"
                    className="close"
                    aria-label={t('common.clear')}
                    onClick={clear}
                    {...pressable()}
                />
            </header>
            {invalidRegex ? (
                <span className="regex-invalid" role="status">
                    {t('search.regexInvalid')}
                </span>
            ) : null}
            {panel}
        </StyledSearch>
    );
};
