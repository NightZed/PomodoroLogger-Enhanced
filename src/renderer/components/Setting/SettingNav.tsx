import React from 'react';
import { AntdIcon as Icon } from '../antdIcon';
import styled from 'styled-components';
import { useI18n } from '../../i18n';
import { SECTIONS, SectionId, SectionMeta } from './sections';

/**
 * Secondary navigation of the settings page: the groups defined in
 * `sections.ts`, in the same order.
 *
 * Built from plain buttons instead of antd's `Menu`. The inline menu variant
 * brings its own dark palette and selected-item styling, which would have to be
 * overridden here anyway (see the `.ant-menu-*` rules in `theme/globalStyle.ts`),
 * and these items only need a label, an icon and a selected state -- the same
 * combination `ThemeButton` in the appearance section already renders.
 *
 * The sidebar stays on the left at every window width: narrowing the window
 * narrows the content pane, it never turns the navigation into a top bar.
 */
const Nav = styled.nav`
    flex: 0 0 auto;
    width: 216px;
    padding: 16px 12px;
    color: var(--pl-text);
    -webkit-app-region: no-drag;
    overflow-y: auto;
    background-color: var(--pl-bg-sunken);
    border-right: 1px solid var(--pl-border);
`;

const NavList = styled.ul`
    margin: 0;
    padding: 0;
    list-style: none;
    position: sticky;
    top: 0;
`;

const NavItem = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    margin-bottom: 2px;
    border: none;
    border-radius: 7px;
    font-family: inherit;
    font-size: 13px;
    font-weight: ${({ $active }) => ($active ? 500 : 400)};
    text-align: left;
    cursor: pointer;
    transition:
        background-color 0.15s,
        color 0.15s;
    background-color: ${({ $active }) => ($active ? 'var(--pl-bg-hover)' : 'transparent')};
    color: ${({ $active }) => ($active ? 'var(--pl-primary)' : 'var(--pl-text-secondary)')};

    .anticon {
        margin-right: 8px;
        font-size: 14px;
    }

    &:hover {
        background-color: var(--pl-bg-hover);
        color: ${({ $active }) => ($active ? 'var(--pl-primary)' : 'var(--pl-text)')};
    }

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: -2px;
    }
`;

interface Props {
    active: SectionId;
    onChange: (id: SectionId) => void;
}

const SettingNav: React.FC<Props> = ({ active, onChange }) => {
    const { t } = useI18n();

    return (
        <Nav aria-label={t('settings.sectionsLabel')}>
            <NavList>
                {SECTIONS.map((section: SectionMeta) => (
                    <li key={section.id}>
                        <NavItem
                            type="button"
                            $active={active === section.id}
                            aria-current={active === section.id}
                            onClick={() => onChange(section.id)}
                        >
                            <Icon type={section.icon} />
                            {t(section.titleKey)}
                        </NavItem>
                    </li>
                ))}
            </NavList>
        </Nav>
    );
};

export default SettingNav;
