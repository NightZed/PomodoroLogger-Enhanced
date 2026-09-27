import { Icon } from 'antd';
import React from 'react';
import styled from 'styled-components';
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
 */
const Nav = styled.nav`
    flex: 0 0 auto;
    width: 168px;
    padding: 12px 8px 12px 12px;
    color: var(--pl-text);
    -webkit-app-region: no-drag;
    overflow-y: auto;
`;

const NavList = styled.ul`
    margin: 0;
    padding: 0;
    list-style: none;
    position: sticky;
    top: 0;
`;

const NavItem = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 2px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
    background-color: ${({ active }) => (active ? 'var(--pl-bg-hover)' : 'transparent')};
    color: ${({ active }) => (active ? 'var(--pl-primary)' : 'var(--pl-text-secondary)')};

    .anticon {
        margin-right: 8px;
    }

    :hover {
        background-color: var(--pl-bg-hover);
        color: var(--pl-text);
    }
`;

interface Props {
    active: SectionId;
    onChange: (id: SectionId) => void;
}

const SettingNav: React.FC<Props> = ({ active, onChange }) => (
    <Nav aria-label="Settings sections">
        <NavList>
            {SECTIONS.map((section: SectionMeta) => (
                <li key={section.id}>
                    <NavItem
                        type="button"
                        active={active === section.id}
                        aria-current={active === section.id}
                        onClick={() => onChange(section.id)}
                    >
                        <Icon type={section.icon} />
                        {section.title}
                    </NavItem>
                </li>
            ))}
        </NavList>
    </Nav>
);

export default SettingNav;
