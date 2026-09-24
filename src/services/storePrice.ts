import { Platform } from "react-native";

/**
 * What the user is actually charged for the FIRST period — which is not what
 * `priceString` says.
 *
 * On Google Play, `StoreProduct.price` and `priceString` are the **recurring**
 * price. A discount lives in `defaultOption.introPhase`, so reading the obvious
 * field makes a flash-sale package and the normal package show the *same
 * number* while the store charges different amounts. That defeats the entire
 * point of running a sale.
 *
 * On the App Store the opposite is true, so intro reading is off there.
 * StoreKit only charges the intro price to an account that is still eligible
 * (has not used the intro offer for that subscription group), and a reviewer's
 * sandbox account usually is not. Showing the intro price to an ineligible
 * account produces "the paywall says one price and the store charges another",
 * which is a rejection. `priceString` from StoreKit is already the number
 * StoreKit will display and charge, so iOS uses it as-is.
 *
 * Free trial phases are deliberately ignored: a 0 on a plan card reads as
 * "free forever". Only paid introductory phases count here.
 *
 * Kept free of any `react-native-purchases` import so the rule can be reasoned
 * about — and tested — without a device build.
 */
export type PricedProduct = {
    price: number;
    priceString: string;
    introPrice?: { price: number; priceString: string } | null;
    defaultOption?: {
        introPhase?: { price?: { amountMicros: number; formatted: string } | null } | null;
    } | null;
};

export type EffectivePrice = { price: number; priceString: string };

/**
 * @param applyIntro Read the introductory phase instead of the headline price.
 *   Defaults to true on Android and false on iOS, for the reasons above.
 */
export function effectivePrice(
    product: PricedProduct,
    applyIntro: boolean = Platform.OS === "android",
): EffectivePrice {
    if (!applyIntro) {
        return { price: product.price, priceString: product.priceString };
    }

    // Play: the default option's intro phase is the unambiguous source — the
    // exact figure Play will take on the first cycle. Preferred over
    // `introPrice`, which is RevenueCat's flattened summary of it.
    const phase = product.defaultOption?.introPhase ?? null;
    if (phase?.price && phase.price.amountMicros > 0) {
        return {
            price: phase.price.amountMicros / 1e6,
            priceString: phase.price.formatted,
        };
    }

    // App Store shape, and a safety net for Play.
    const intro = product.introPrice;
    if (intro && intro.price > 0) {
        return { price: intro.price, priceString: intro.priceString };
    }

    // No offer, or the account is not eligible for one.
    return { price: product.price, priceString: product.priceString };
}

/** How much cheaper the sale is, as a whole percent. 0 when it is not. */
export function discountPercent(sale: number, full: number): number {
    if (!(full > 0) || !(sale > 0) || sale >= full) return 0;
    return Math.round((1 - sale / full) * 100);
}
