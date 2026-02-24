import {
    userStatsRepo,
    userAssetsRepo,
    subscriptionsRepo,
} from "../repositories";
import { UserStats, UserAssets, Subscriptions } from "../types/database";

export class UserService {
    async getUserStats(userId: string): Promise<UserStats | null> {
        return userStatsRepo.getByUserId(userId);
    }

    async getUserAssets(userId: string): Promise<UserAssets[]> {
        return userAssetsRepo.getByUserId(userId);
    }

    async getUserAssetsByType(
        userId: string,
        itemType: UserAssets["item_type"]
    ): Promise<UserAssets[]> {
        return userAssetsRepo.getByItemType(userId, itemType);
    }

    async getActiveSubscription(userId: string): Promise<Subscriptions | null> {
        return subscriptionsRepo.getActiveByUserId(userId);
    }
}

export const userService = new UserService();
