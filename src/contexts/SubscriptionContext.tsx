import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import Purchases, {
    CustomerInfo,
    PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";
import { analyticsService } from "../services/AnalyticsService";
import { AdsManager } from "../services/AdsManager";

Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);

const REVENUECAT_API_KEY_IOS = "appl_NaXLvvZfTtuEAgTeAAuXUYCgTpD";
const REVENUECAT_API_KEY_ANDROID = "goog_UWaWUNwJbAHkjnsXXzIPToKeefY";

/** RevenueCat entitlement identifier that grants PRO access. */
export const ENTITLEMENT_ID = "pro";

export const checkIsPro = (info: CustomerInfo | null) => {
    if (!info) return false;
    // Primary: the "pro" entitlement is active.
    if (info.entitlements.active[ENTITLEMENT_ID] !== undefined) return true;
    // Tolerant fallback: any active entitlement (guards against dashboard
    // mapping drift so a paying user is never wrongly treated as free).
    return Object.keys(info.entitlements.active).length > 0;
};

interface SubscriptionContextData {
    isPro: boolean;
    isLoading: boolean;
    packages: PurchasesPackage[];
    customerInfo: CustomerInfo | null;
    purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
    restorePurchases: () => Promise<{ isPro: boolean; error?: string }>;
    refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextData>({
    isPro: false,
    isLoading: true,
    packages: [],
    customerInfo: null,
    purchasePackage: async () => ({ success: false }),
    restorePurchases: async () => ({ isPro: false }),
    refreshStatus: async () => { },
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children, userId }: { children: ReactNode; userId?: string }) {
    const [isPro, setIsPro] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
    const configuredRef = useRef(false);

    const updateFromInfo = useCallback((info: CustomerInfo) => {
        setCustomerInfo(info);
        setIsPro(checkIsPro(info));
    }, []);

    // Configure RevenueCat SDK exactly once
    useEffect(() => {
        if (configuredRef.current) return;
        configuredRef.current = true;

        const init = async () => {
            try {
                const apiKey = Platform.OS === "ios" ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
                Purchases.configure({ apiKey });

                // Load offerings
                const offerings = await Purchases.getOfferings();
                if (offerings.current) {
                    setPackages(offerings.current.availablePackages);
                }

                // Initial subscription check
                const info = await Purchases.getCustomerInfo();
                updateFromInfo(info);
            } catch (e) {
                console.error("[SubscriptionProvider] Init error:", e);
            } finally {
                setIsLoading(false);
            }
        };
        init();

        // Listen for real-time entitlement changes (purchases, renewals, cancellations)
        const listener = (info: CustomerInfo) => {
            updateFromInfo(info);
        };
        Purchases.addCustomerInfoUpdateListener(listener);

        // RevenueCat v9 addCustomerInfoUpdateListener returns void; no cleanup needed
    }, [updateFromInfo]);

    // Log in / identify user separately so re-renders on userId change don't re-configure
    useEffect(() => {
        if (!userId || !configuredRef.current) return;

        const identify = async () => {
            try {
                const { customerInfo: info } = await Purchases.logIn(userId);
                updateFromInfo(info);
                // Sync Analytics ID
                analyticsService.setUserId(userId);
            } catch (e) {
                console.error("[SubscriptionProvider] logIn error:", e);
            }
        };
        identify();
    }, [userId, updateFromInfo]);

    const purchasePackage = useCallback(async (pkg: PurchasesPackage) => {
        try {
            analyticsService.logPurchaseStart('subscription', pkg.product.identifier);
            // Suppress the App Open ad that would fire when returning from the
            // Google/Apple purchase popup (policy rule 18).
            AdsManager.suppressNextResumeAd();
            const { customerInfo: info } = await Purchases.purchasePackage(pkg);
            updateFromInfo(info);

            const isSuccess = checkIsPro(info);
            if (isSuccess) {
                // Log both for comprehensive tracking
                analyticsService.logSubscriptionPurchase(
                    pkg.product.identifier,
                    pkg.product.price
                );
                analyticsService.logPurchaseComplete(
                    pkg.product.identifier,
                    'subscription',
                    pkg.product.price,
                    pkg.product.currencyCode
                );
            }

            return { success: isSuccess };
        } catch (e: any) {
            if (e.userCancelled) {
                analyticsService.logPurchaseCancelled('subscription');
                return { success: false, error: "cancelled" };
            }
            analyticsService.logPurchaseFailed('subscription', e.message);
            return { success: false, error: e.message || "Purchase failed" };
        }
    }, [updateFromInfo]);

    const restorePurchases = useCallback(async () => {
        try {
            AdsManager.suppressNextResumeAd();
            const info = await Purchases.restorePurchases();
            updateFromInfo(info);
            const successful = checkIsPro(info);
            analyticsService.logSubscriptionRestore(successful);
            return { isPro: successful };
        } catch (e: any) {
            analyticsService.logSubscriptionRestore(false);
            return { isPro: false, error: e.message || "Restore failed" };
        }
    }, [updateFromInfo]);

    const refreshStatus = useCallback(async () => {
        try {
            const info = await Purchases.getCustomerInfo();
            updateFromInfo(info);
        } catch (e) {
            console.error("[SubscriptionProvider] Refresh error:", e);
        }
    }, [updateFromInfo]);

    return (
        <SubscriptionContext.Provider
            value={{ isPro, isLoading, packages, customerInfo, purchasePackage, restorePurchases, refreshStatus }}
        >
            {children}
        </SubscriptionContext.Provider>
    );
}
