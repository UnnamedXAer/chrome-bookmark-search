declare type MaybeElement = Element | null | undefined;

declare function setActiveLI(li: MaybeElement, block?: ScrollLogicalPosition): void;
declare function setActiveLI(idx: number, block?: ScrollLogicalPosition): void;
