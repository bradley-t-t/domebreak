import {createContext, useContext} from "react";

export const AccountCtx = createContext(null);

export function useAccount() {
    const v = useContext(AccountCtx);
    if (!v) throw new Error("useAccount must be used within AccountProvider");
    return v;
}
