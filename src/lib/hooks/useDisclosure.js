import {useCallback, useState} from "react";

// Own an open/closed flag with stable show/hide/toggle callbacks so every
// popover, menu, and modal stops reinventing the same three inline setters.
export function useDisclosure(initial = false) {
    const [open, setOpen] = useState(initial);
    const show = useCallback(() => setOpen(true), []);
    const hide = useCallback(() => setOpen(false), []);
    const toggle = useCallback(() => setOpen((v) => !v), []);
    return {open, show, hide, toggle, set: setOpen};
}
