import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { flashSaleTestMode } from "./remoteConfig";
import { FLASH_OFFERING_ID, isFlashPackage } from "../components/flash/ids";

/**
 * A discounted PRO window that opens once a day, right after the paywall is
 * closed.
 *
 * The timing is the whole idea: someone who just looked at the full price and
 * said no is the only person for whom a lower price still means anything. It
 * does not open a dialog on top of the one they just dismissed — it leaves a
 * gift on the play screen, and tapping that is the invitation being accepted.
 *
 * Three things are persisted, and each is persisted as the right kind of
 * value, which is what makes the offer honest:
 *
 *   • the deadline, as an absolute epoch-ms timestamp — storing "seconds left"
 *     would restart the clock on every cold launch and a three-hour offer
 *     would never actually end;
 *   • the day it last opened, as `yyyy-mm-dd` rather than a boolean, so it can
 *     come back tomorrow;
 *   • the stage, so a relaunch does not put back a gift box that has already
 *     been opened.
 *
 * The clock is device time. Winding it back extends the offer and re-arms
 * tomorrow early — accepted: this manufactures urgency, it is not a security
 * boundary, and the store is what refuses a purchase at the wrong price.
 */

const DEADLINE_KEY = "flash_deadline_ms";
const SHOWN_DAY_KEY = "flash_shown_day";
const STAGE_KEY = "flash_stage";
const SNOOZE_KEY = "flash_snooze_until_ms";

/** How long the window stays open. The on-screen clock counts this down. */
const WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * How long "no thanks" lasts.
 *
 * Declining in the sheet is a real answer and it is respected, but it is not
 * permanent: the offer comes back a day later on its own. Measured from the
 * press rather than snapped to the next calendar day, so declining at 23:00
 * does not bring the gift back an hour later.
 */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * What the play screen should be painting.
 *
 * `hidden` is not `none`: the offer is still running with nothing on screen.
 * Closing the ribbon is "not now", not "never" — a relaunch brings it back as
 * `banner`, because swiping something away while busy is not a refusal of the
 * next three hours.
 */
export type FlashStage = "none" | "gift" | "banner" | "hidden";

const STAGES: readonly FlashStage[] = ["none", "gift", "banner", "hidden"];

/** Local `yyyy-mm-dd`. Local, so "once a day" means the user's day. */
function today(): string {
    const n = new Date();
    const mm = String(n.getMonth() + 1).padStart(2, "0");
    const dd = String(n.getDate()).padStart(2, "0");
    return `${n.getFullYear()}-${mm}-${dd}`;
}

async function read(key: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(key);
    } catch {
        return null;
    }
}

async function write(key: string, value: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch {
        /* the offer still runs for this session */
    }
}

async function drop(key: string): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        /* nothing to do */
    }
}

/**
 * Has this account ever completed any purchase?
 *
 * Lives here rather than in a purchase service so the flash sale has one
 * import and one reason to be blocked. Failing closed on an error would hide
 * the offer from everybody the first time RevenueCat is slow, so it fails
 * open — the store still refuses an ineligible price.
 */
async function hasEverPurchased(): Promise<boolean> {
    try {
        const Purchases = (await import("react-native-purchases")).default;
        const info = await Purchases.getCustomerInfo();
        return (
            Object.keys(info.allPurchaseDates ?? {}).length > 0 ||
            (info.nonSubscriptionTransactions?.length ?? 0) > 0
        );
    } catch {
        return false;
    }
}

/**
 * Is there actually a flash package to sell?
 *
 * `true` / `false` when RevenueCat answered, `null` when it could not be asked.
 * The distinction is the point: a gift box that opens onto "no offer" has
 * happened here before — the package existed in the dashboard with no product
 * attached, so the app was handed an offering with nothing in it. An answered
 * "no package" must hide the gift. A network failure must not, or one slow
 * response hides the offer from everybody.
 */
async function hasFlashPackage(): Promise<boolean | null> {
    try {
        const Purchases = (await import("react-native-purchases")).default;
        const offerings = await Purchases.getOfferings();
        const dedicated = offerings.all[FLASH_OFFERING_ID];
        const pool = [
            ...(dedicated?.availablePackages ?? []),
            ...(offerings.current?.availablePackages ?? []),
        ];
        return pool.some(isFlashPackage) || (dedicated?.availablePackages.length ?? 0) > 0;
    } catch {
        return null;
    }
}

type Listener = () => void;

class FlashSale {
    private deadlineMs: number | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private currentStage: FlashStage = "none";

    /**
     * Two listener sets on purpose.
     *
     * `tick` fires every second and drives the countdown text. `stage` fires
     * only when the stage changes, so the play screen can decide what to paint
     * without re-rendering once a second — there is a live 3D WebView behind
     * it, and re-rendering over that is not free.
     */
    private tickListeners = new Set<Listener>();
    private stageListeners = new Set<Listener>();

    subscribe(fn: Listener): () => void {
        this.tickListeners.add(fn);
        return () => { this.tickListeners.delete(fn); };
    }

    subscribeStage(fn: Listener): () => void {
        this.stageListeners.add(fn);
        return () => { this.stageListeners.delete(fn); };
    }

    private emit(): void {
        for (const fn of this.tickListeners) fn();
    }

    private emitStage(): void {
        for (const fn of this.stageListeners) fn();
    }

    get stage(): FlashStage {
        return this.currentStage;
    }

    /** Milliseconds left; 0 when no offer is running. */
    get remainingMs(): number {
        if (this.deadlineMs == null) return 0;
        return Math.max(0, this.deadlineMs - Date.now());
    }

    get isActive(): boolean {
        return this.remainingMs > 0;
    }

    /**
     * The countdown, `02:59:58` while there are hours left and `09:58` below
     * one — the leading `00:` is noise, and a shorter number reads as more
     * urgent, which is the point.
     */
    get clock(): string {
        const total = Math.floor(this.remainingMs / 1000);
        const h = Math.floor(total / 3600);
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
        const s = String(total % 60).padStart(2, "0");
        return h > 0 ? `${String(h).padStart(2, "0")}:${m}:${s}` : `${m}:${s}`;
    }

    /** Move to a stage and remember it. */
    async setStage(stage: FlashStage): Promise<void> {
        if (this.currentStage === stage) return;
        this.currentStage = stage;
        this.emitStage();
        await write(STAGE_KEY, stage);
    }

    /** Move without persisting — for restore and expiry. */
    private setStageLocal(stage: FlashStage): void {
        if (this.currentStage === stage) return;
        this.currentStage = stage;
        this.emitStage();
    }

    /** Pick up a window that was still running. Call once at boot. */
    async restore(): Promise<void> {
        const raw = await read(DEADLINE_KEY);
        const ms = raw ? Number(raw) : NaN;
        if (!Number.isFinite(ms)) return;

        if (ms > Date.now()) {
            this.deadlineMs = ms;
            this.startTicker();
            const saved = await read(STAGE_KEY);
            let stage: FlashStage =
                saved && (STAGES as readonly string[]).includes(saved)
                    ? (saved as FlashStage)
                    : "gift";
            if (stage === "hidden") stage = "banner";
            this.setStageLocal(stage);
        } else {
            await drop(DEADLINE_KEY);
        }
        this.emit();
    }

    /** Already opened today? The offer runs once a day. */
    async shownToday(): Promise<boolean> {
        return (await read(SHOWN_DAY_KEY)) === today();
    }

    /**
     * Open the window. A no-op while one is already running or once today's
     * has been used, so the caller can fire it on every paywall close without
     * thinking about it.
     */
    async start(): Promise<boolean> {
        if (this.isActive) return false;

        // Both gates below are correct in production and impassable in QA: one
        // attempt per device per day, and none at all for a tester who has
        // ever bought something. `flash_sale_test_mode` lifts them from
        // Firebase, with no rebuild.
        const testing = flashSaleTestMode();

        if (!testing && (await this.shownToday())) return false;
        // Declined in the sheet within the last day. Checked before the two
        // network gates below so a "no thanks" costs nothing to honour.
        if (!testing && (await this.isSnoozed())) return false;
        // Anyone who has ever bought anything is out. The price behind this is
        // an introductory offer, and the stores only honour those for eligible
        // accounts — showing the gift, the countdown and the discounted card
        // to someone who would then be charged full price is the "paywall
        // price does not match the store" rejection, written down.
        if (!testing && (await hasEverPurchased())) return false;
        // And there has to be something to sell. `false` only when RevenueCat
        // answered and had no flash package; an unreachable store still opens
        // the window — see `hasFlashPackage`.
        if (!testing && (await hasFlashPackage()) === false) return false;

        this.deadlineMs = Date.now() + WINDOW_MS;
        await write(DEADLINE_KEY, String(this.deadlineMs));
        await write(SHOWN_DAY_KEY, today());
        await write(STAGE_KEY, "gift");
        this.startTicker();
        this.setStageLocal("gift");
        this.emit();
        return true;
    }

    /** Declined in the sheet, and the decline has not expired yet. */
    async isSnoozed(): Promise<boolean> {
        const raw = await read(SNOOZE_KEY);
        const until = raw ? Number(raw) : NaN;
        if (!Number.isFinite(until)) return false;
        if (until <= Date.now()) {
            await drop(SNOOZE_KEY);
            return false;
        }
        return true;
    }

    /**
     * "No thanks": take the whole offer off the screen for a day.
     *
     * Different from closing the ribbon, which only hides it until the next
     * launch. This ends the running window too — leaving a banner up after an
     * explicit decline is nagging, and the discount is meant to feel like a
     * moment, not a fixture. `maybeStart` brings it back once `SNOOZE_MS` is up,
     * provided the account is still eligible.
     */
    async snooze(): Promise<void> {
        await write(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
        // Clear today's marker: the snooze is now the gate, and leaving both in
        // place would push the return to whichever is later for no reason.
        await drop(SHOWN_DAY_KEY);
        await this.end();
    }

    /**
     * Open a window without the user having touched the paywall.
     *
     * The paywall close is the best moment for this offer, but it cannot be the
     * only one: after a decline, or a window that simply expired, nothing would
     * ever bring the gift back unless the user happened to open and close the
     * paywall again. Called at boot; every gate in `start` still applies, so on
     * any day the offer is not due this is one cheap read and nothing else.
     */
    async maybeStart(): Promise<boolean> {
        if (this.isActive) return false;
        return this.start();
    }

    /** They bought, or they were PRO all along. */
    async end(): Promise<void> {
        this.deadlineMs = null;
        this.stopTicker();
        this.setStageLocal("none");
        await drop(DEADLINE_KEY);
        this.emit();
    }

    private startTicker(): void {
        this.stopTicker();
        // One tick a second. The clock counts seconds; anything faster is work
        // for nothing, over a live 3D scene.
        this.ticker = setInterval(() => {
            if (!this.isActive) {
                this.stopTicker();
                this.deadlineMs = null;
                this.setStageLocal("none");
                void drop(DEADLINE_KEY);
            }
            this.emit();
        }, 1000);
    }

    private stopTicker(): void {
        if (this.ticker != null) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
    }

    /** Wipe everything, so the flow can be run again from the top. */
    async reset(): Promise<void> {
        await Promise.all([drop(DEADLINE_KEY), drop(SHOWN_DAY_KEY), drop(STAGE_KEY), drop(SNOOZE_KEY)]);
        this.deadlineMs = null;
        this.stopTicker();
        this.setStageLocal("none");
        this.emit();
    }
}

export const flashSale = new FlashSale();

/**
 * Re-renders on every tick. For the countdown text only — anything that just
 * needs to know WHICH overlay to draw should use `useFlashStage`, which does
 * not fire once a second over a live 3D scene.
 */
export function useFlashSale(): {
    isActive: boolean;
    remainingMs: number;
    clock: string;
} {
    const [, force] = useState(0);
    useEffect(() => flashSale.subscribe(() => force((n) => n + 1)), []);
    return {
        isActive: flashSale.isActive,
        remainingMs: flashSale.remainingMs,
        clock: flashSale.clock,
    };
}

/** Re-renders only when the stage changes. */
export function useFlashStage(): FlashStage {
    const [stage, setStage] = useState<FlashStage>(flashSale.stage);
    useEffect(() => flashSale.subscribeStage(() => setStage(flashSale.stage)), []);
    return stage;
}
