import { useEffect, useRef, useState } from "react";
import { useSubscription } from "../contexts/SubscriptionContext";
import { abandonSplashAd, showSplashAd } from "../services/splashAd";
import { track } from "../services/trackEvents";
import { isFirstSession } from "../services/session";

/**
 * Runs the cold-start splash ad (`open_splash`, falling back to
 * `inter_splash`) once, and tells the navigator when the boot screen is free
 * to hand over.
 *
 * Two things this has to get right:
 *
 *  1. **Never show it to a PRO user.** RevenueCat resolves asynchronously, so
 *     at the first frame `isPro` is false only because nothing is known yet.
 *     Showing the ad then would put an ad in front of a paying subscriber, so
 *     we wait for the subscription state to settle — but only up to
 *     [PRO_WAIT_MS], because a store round-trip must not hold the launch.
 *  2. **Never wedge the splash.** [HARD_DEADLINE_MS] releases the boot screen
 *     no matter what the SDK is doing.
 */

/** Max wait for RevenueCat before assuming the user is not PRO. */
const PRO_WAIT_MS = 1500;
/** Absolute cap on how long the ad may hold the boot screen. */
const HARD_DEADLINE_MS = 9000;

export function useSplashAd(): { splashAdDone: boolean } {
    const { isPro, isLoading } = useSubscription();
    const [done, setDone] = useState(false);
    const startedRef = useRef(false);
    /** Read at fire time, so we use the freshest PRO answer we have. */
    const isProRef = useRef(isPro);
    isProRef.current = isPro;

    useEffect(() => {
        // Wait for the subscription answer, but not forever.
        if (isLoading && !startedRef.current) {
            const t = setTimeout(() => start(), PRO_WAIT_MS);
            return () => clearTimeout(t);
        }
        start();

        function start() {
            if (startedRef.current) return;
            startedRef.current = true;

            // No full-screen ad on the very first launch: the first minute
            // decides whether someone stays, and an ad before they have seen
            // the app is the worst trade we can make.
            if (isFirstSession()) {
                setDone(true);
                return;
            }

            // On the deadline, tell the ad to stand down as well as releasing
            // the boot screen. Releasing alone leaves the ad in flight, and it
            // then presents over whichever screen the app has moved on to.
            const release = setTimeout(() => {
                abandonSplashAd();
                setDone(true);
            }, HARD_DEADLINE_MS);
            track.splashInterOpen();
            showSplashAd(isProRef.current, () => clearTimeout(release)).finally(() => {
                clearTimeout(release);
                setDone(true);
            });
        }
    }, [isLoading]);

    return { splashAdDone: done };
}
