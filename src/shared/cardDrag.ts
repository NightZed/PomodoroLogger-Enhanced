/**
 * One drag inside a board. `toIndex` is the index the drag library reported,
 * which is the position in the destination column after the card has been
 * removed from its old one.
 */
export interface MoveCardInBoardPayload {
    cardId: string;
    fromListId: string;
    toListId: string;
    toIndex: number;
}
