import { useEffect, useState } from "react";
import { getRuby } from "./economyService";

/**
 * The ruby balance, shared by everything that shows it (top-bar pill, Quest
 * page, unlock dialogs). Every server call that moves ruby returns the new
 * balance; callers hand it to `setRuby` so all displays agree immediately.
 */
let balance: number | null = null;
const listeners = new Set<(n: number | null) => void>();

export function setRuby(n: number | null | undefined): void {
    if (typeof n !== "number" || n === balance) return;
    balance = n;
    listeners.forEach((l) => l(balance));
}

export function getCachedRuby(): number | null {
    return balance;
}

export async function refreshRuby(): Promise<number | null> {
    try {
        setRuby(await getRuby());
    } catch {
        /* keep the last known value */
    }
    return balance;
}

export function useRuby(): number | null {
    const [n, setN] = useState(balance);
    useEffect(() => {
        listeners.add(setN);
        setN(balance);
        return () => {
            listeners.delete(setN);
        };
    }, []);
    return n;
}
