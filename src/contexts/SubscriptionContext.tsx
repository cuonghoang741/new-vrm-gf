import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import Purchases, {
    CustomerInfo,
    PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";

const REVENUECAT_API_KEY_IOS = "appl_YOUR_KEY_HERE"; // TODO: replace
const REVENUECAT_API_KEY_ANDROID = "goog_YOUR_KEY_HERE"; // TODO: replace
const PRO_ENTITLEMENT_ID = "pro";

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

    // Initialize RevenueCat
    useEffect(() => {
        const init = async () => {
            try {
                const apiKey = Platform.OS === "ios" ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
                Purchases.configure({ apiKey });

                if (userId) {
                    await Purchases.logIn(userId);
                }

                // Load offerings
                const offerings = await Purchases.getOfferings();
                if (offerings.current) {
                    setPackages(offerings.current.availablePackages);
                }

                // Check subscription status
                const info = await Purchases.getCustomerInfo();
                setCustomerInfo(info);
                const hasPro = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
                setIsPro(hasPro);
            } catch (e) {
                console.error("[SubscriptionProvider] Init error:", e);
            } finally {
                setIsLoading(false);
            }
        };
        init();

        // Listen for changes
        Purchases.addCustomerInfoUpdateListener((info) => {
            setCustomerInfo(info);
            setIsPro(info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined);
        });
    }, [userId]);

    const purchasePackage = useCallback(async (pkg: PurchasesPackage) => {
        try {
            const { customerInfo: info } = await Purchases.purchasePackage(pkg);
            setCustomerInfo(info);
            const hasPro = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
            setIsPro(hasPro);
            return { success: hasPro };
        } catch (e: any) {
            if (e.userCancelled) {
                return { success: false, error: "cancelled" };
            }
            return { success: false, error: e.message || "Purchase failed" };
        }
    }, []);

    const restorePurchases = useCallback(async () => {
        try {
            const info = await Purchases.restorePurchases();
            setCustomerInfo(info);
            const hasPro = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
            setIsPro(hasPro);
            return { isPro: hasPro };
        } catch (e: any) {
            return { isPro: false, error: e.message || "Restore failed" };
        }
    }, []);

    const refreshStatus = useCallback(async () => {
        try {
            const info = await Purchases.getCustomerInfo();
            setCustomerInfo(info);
            setIsPro(info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined);
        } catch (e) {
            console.error("[SubscriptionProvider] Refresh error:", e);
        }
    }, []);

    return (
        <SubscriptionContext.Provider
            value={{ isPro, isLoading, packages, customerInfo, purchasePackage, restorePurchases, refreshStatus }}
        >
            {children}
        </SubscriptionContext.Provider>
    );
}
