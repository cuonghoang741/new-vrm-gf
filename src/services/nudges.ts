import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../config/supabase";
import { currentLang } from "../i18n";
import { hasSeen, markSeen } from "./seenOnce";

/**
 * She texts first.
 *
 * There is no push server, so her "I miss you" lines are written ahead of time
 * by the `nudges` function and handed to the phone as local notifications
 * when the app goes to the background (4 h, 22 h, 3 days). Coming back
 * cancels whatever has not fired, so she never pings someone who is here.
 * Opening one writes it into the chat as her message.
 */
type Nudge = { id: string; text: string; delay_hours: number };
const CHANNEL = "her-messages";

let ready: { characterId: string; name: string; nudges: Nudge[] } | null = null;
let preparing: string | null = null;

Notifications.setNotificationHandler({
    // They are only scheduled while the app is away; if one lands while it is
    // open anyway, show it like a message would be shown.
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

async function ensureChannel() {
    if (Platform.OS !== "android") return;
    await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Messages from her",
        importance: Notifications.AndroidImportance.HIGH,
    });
}

/** Ask for the notification permission once, at a moment that explains it. */
export async function askNudgePermissionOnce(): Promise<void> {
    try {
        if (await hasSeen("nudge_permission")) return;
        void markSeen("nudge_permission");
        const cur = await Notifications.getPermissionsAsync();
        // "denied" with canAskAgain is Android 13's state before the first
        // ask on some devices, and after a revoke; only a refusal the system
        // will not let us repeat is final.
        if (cur.status !== "granted" && cur.canAskAgain !== false) await Notifications.requestPermissionsAsync();
    } catch { /* never block the chat on this */ }
}

/** Have her write tonight's lines for this character. Cheap to call often. */
export async function prepareNudges(characterId: string, name: string): Promise<void> {
    if (preparing === characterId || (ready?.characterId === characterId && ready.nudges.length)) return;
    preparing = characterId;
    try {
        const { data, error } = await supabase.functions.invoke("nudges", {
            body: { action: "prepare", character_id: characterId, lang: currentLang() },
        });
        if (error) return;
        const d = typeof data === "string" ? JSON.parse(data) : data;
        if (Array.isArray(d?.nudges) && d.nudges.length) ready = { characterId, name, nudges: d.nudges };
    } catch { /* no lines tonight */ } finally {
        preparing = null;
    }
}

/** App went to the background: schedule her lines. */
export async function scheduleNudges(): Promise<void> {
    try {
        if (!ready) return;
        const perm = await Notifications.getPermissionsAsync();
        if (perm.status !== "granted") return;
        await ensureChannel();
        await Notifications.cancelAllScheduledNotificationsAsync();
        for (const n of ready.nudges) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: ready.name,
                    body: n.text,
                    data: { nudgeId: n.id, characterId: ready.characterId },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: Math.max(60, Math.round(n.delay_hours * 3600)),
                    channelId: CHANNEL,
                },
            });
        }
    } catch { /* best effort */ }
}

/** App is back: she does not text someone who is already here. */
export async function cancelNudges(): Promise<void> {
    try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ }
}

/**
 * Opening one of her notifications (cold start included) writes the line into
 * the chat; `onDelivered` lets the chat reload so it is there when it opens.
 */
export function listenNudgeOpens(onDelivered: (characterId: string) => void): () => void {
    const handle = async (resp: Notifications.NotificationResponse | null) => {
        const data = resp?.notification?.request?.content?.data as { nudgeId?: string; characterId?: string } | undefined;
        if (!data?.nudgeId || !data.characterId) return;
        try {
            await supabase.functions.invoke("nudges", { body: { action: "deliver", id: data.nudgeId } });
        } catch { /* the chat simply will not have it */ }
        ready = null; // spent: write a fresh set next time
        onDelivered(data.characterId);
    };
    void Notifications.getLastNotificationResponseAsync().then(handle);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
}
