import * as React from 'react';
import { Input, Select } from 'antd';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { AppModal } from '../AppModal';
import { useI18n } from '../../i18n';
import type { RootState } from '../../reducers';
import type { KanbanBoard } from './type';

const { Option } = Select;

type SortBy = 'created' | 'visited' | 'name';

export interface ProjectPickerProps {
    open: boolean;
    /** Currently selected board, highlighted in the grid. */
    value?: string;
    /** `undefined` means "no project": the session drops its board. */
    onPick: (boardId?: string) => void;
    onClose: () => void;
    zIndex?: number;
    /**
     * Whether to offer the "no project" button. Moving a card always needs a
     * destination board, so the move dialog turns it off.
     */
    allowNone?: boolean;
}

interface Props extends ProjectPickerProps {
    boards: { [id: string]: KanbanBoard };
}

const Toolbar = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
    padding: 2px;
`;

const BoardOption = styled.button<{ $selected: boolean; $hidden: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid ${({ $selected }) => ($selected ? 'transparent' : 'var(--pl-border)')};
    background-color: ${({ $selected }) =>
        $selected ? 'var(--pl-accent)' : 'var(--pl-bg-elevated)'};
    color: ${({ $selected }) => ($selected ? '#fff' : 'var(--pl-text)')};
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    opacity: ${({ $hidden }) => ($hidden ? 0.6 : 1)};

    &:hover {
        background-color: ${({ $selected }) =>
            $selected ? 'var(--pl-accent)' : 'var(--pl-bg-hover)'};
    }
`;

const BoardName = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const HiddenTag = styled.span`
    flex: none;
    font-size: 11px;
    opacity: 0.75;
`;

const Empty = styled.div`
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const NoProject = styled.button`
    margin-top: 12px;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--pl-border);
    background-color: transparent;
    color: var(--pl-text-secondary);
    font-size: 13px;
    cursor: pointer;

    &:hover {
        background-color: var(--pl-bg-hover);
    }
`;

const ProjectPickerInner = (props: Props) => {
    const { t } = useI18n();
    const [keyword, setKeyword] = React.useState('');
    // Default is creation time, newest first; the choice is intentionally not
    // persisted -- it is a per-dialog convenience, not a setting.
    const [sortBy, setSortBy] = React.useState<SortBy>('created');

    React.useEffect(() => {
        if (props.open) {
            setKeyword('');
            setSortBy('created');
        }
    }, [props.open]);

    const boards = React.useMemo(() => {
        const term = keyword.trim().toLowerCase();
        const list = Object.values(props.boards).filter(
            (board) => term === '' || board.name.toLowerCase().includes(term)
        );

        return list.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'visited':
                    return (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0);
                default:
                    return (b.createdTime ?? 0) - (a.createdTime ?? 0);
            }
        });
    }, [props.boards, keyword, sortBy]);

    return (
        <AppModal
            open={props.open}
            title={t('kanban.projectPicker.title')}
            onCancel={props.onClose}
            zIndex={props.zIndex ?? 1100}
            footer={null}
        >
            <Toolbar>
                <Input
                    allowClear
                    autoFocus
                    placeholder={t('kanban.projectPicker.search')}
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                />
                <Select<SortBy>
                    value={sortBy}
                    style={{ width: 150, flex: 'none' }}
                    onChange={setSortBy}
                >
                    <Option value="created">{t('kanban.projectPicker.sortCreated')}</Option>
                    <Option value="visited">{t('kanban.projectPicker.sortVisited')}</Option>
                    <Option value="name">{t('kanban.projectPicker.sortName')}</Option>
                </Select>
            </Toolbar>
            {boards.length === 0 ? (
                <Empty>{t('kanban.projectPicker.empty')}</Empty>
            ) : (
                <Grid>
                    {boards.map((board) => (
                        <BoardOption
                            key={board._id}
                            type="button"
                            $selected={board._id === props.value}
                            $hidden={!!board.hidden}
                            title={board.name}
                            onClick={() => props.onPick(board._id)}
                        >
                            <BoardName>{board.name}</BoardName>
                            {board.hidden ? (
                                <HiddenTag>{t('kanban.projectPicker.hidden')}</HiddenTag>
                            ) : undefined}
                        </BoardOption>
                    ))}
                </Grid>
            )}
            {props.allowNone === false ? undefined : (
                <NoProject type="button" onClick={() => props.onPick(undefined)}>
                    {t('kanban.projectPicker.none')}
                </NoProject>
            )}
        </AppModal>
    );
};

/**
 * Dialog-based project chooser. It is a dialog rather than a dropdown because
 * the list grows without bound, needs a search box, and has to carry the
 * "hidden" marker -- none of which fit in a `Select`.
 */
export const ProjectPicker = connect((state: RootState) => ({
    boards: state.kanban.boards,
}))(ProjectPickerInner);
