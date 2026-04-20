import Purchases from "react-native-purchases";

export const revenueCatManager = {
    async logout(): Promise<void> {
        try {
            await Purchases.logOut();
        } catch (error) {
            console.warn("[RevenueCatManager] logout failed", error);
        }
    }
};
