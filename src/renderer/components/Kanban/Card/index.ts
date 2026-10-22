/**
 * Cards are rendered as plain memoized components: the owning list already
 * subscribes to the card map (it needs it for filtering and time totals), so
 * giving every card its own react-redux subscription only added selector and
 * subscription work when a large board mounted. The list passes the card's
 * fields and the dispatch actions down instead.
 */
export { Card } from './Card';
export type { InputProps } from './Card';
