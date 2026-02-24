import { BaseRepository } from "./baseRepo";
import {
    Characters,
    CharacterCostumes,
    Backgrounds,
    Medias,
    MediaCollections,
    Conversation,
    Calls,
    UserStats,
    UserAssets,
    Subscriptions,
    Purchases,
    AppFeedback,
} from "../types/database";

/* ================= REPOSITORIES ================= */

export class CharactersRepo extends BaseRepository<Characters> {
    constructor() {
        super("characters");
    }

    async getPublicCharacters(): Promise<Characters[]> {
        const { data, error } = await this.query
            .select("*")
            .eq("is_public", true)
            .eq("available", true)
            .order("order", { ascending: true });

        if (error) throw error;
        return (data as Characters[]) ?? [];
    }
}

export class CharacterCostumesRepo extends BaseRepository<CharacterCostumes> {
    constructor() {
        super("character_costumes");
    }

    async getByCharacterId(characterId: string): Promise<CharacterCostumes[]> {
        return this.getByColumn("character_id", characterId);
    }
}

export class BackgroundsRepo extends BaseRepository<Backgrounds> {
    constructor() {
        super("backgrounds");
    }

    async getAvailable(): Promise<Backgrounds[]> {
        const { data, error } = await this.query
            .select("*")
            .eq("available", true)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as Backgrounds[]) ?? [];
    }
}

export class MediasRepo extends BaseRepository<Medias> {
    constructor() {
        super("medias");
    }

    async getByCharacterId(characterId: string): Promise<Medias[]> {
        return this.getByColumn("character_id", characterId);
    }

    async getByCollectionId(collectionId: string): Promise<Medias[]> {
        return this.getByColumn("collection_id", collectionId);
    }
}

export class MediaCollectionsRepo extends BaseRepository<MediaCollections> {
    constructor() {
        super("media_collections");
    }

    async getByCharacterId(characterId: string): Promise<MediaCollections[]> {
        return this.getByColumn("character_id", characterId);
    }
}

export class ConversationRepo extends BaseRepository<Conversation> {
    constructor() {
        super("conversation");
    }

    async getByCharacterId(
        characterId: string,
        userId?: string,
        clientId?: string,
        limit = 50
    ): Promise<Conversation[]> {
        let query = this.query
            .select("*")
            .eq("character_id", characterId)
            .order("created_at", { ascending: true })
            .limit(limit);

        if (userId) {
            query = query.eq("user_id", userId);
        } else if (clientId) {
            query = query.eq("client_id", clientId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data as Conversation[]) ?? [];
    }
}

export class CallsRepo extends BaseRepository<Calls> {
    constructor() {
        super("calls");
    }

    async getByUserId(userId: string): Promise<Calls[]> {
        return this.getByColumn("user_id", userId);
    }
}

export class UserStatsRepo extends BaseRepository<UserStats> {
    constructor() {
        super("user_stats");
    }

    async getByUserId(userId: string): Promise<UserStats | null> {
        const results = await this.getByColumn("user_id", userId);
        return results[0] ?? null;
    }

    async getByClientId(clientId: string): Promise<UserStats | null> {
        const results = await this.getByColumn("client_id", clientId);
        return results[0] ?? null;
    }
}

export class UserAssetsRepo extends BaseRepository<UserAssets> {
    constructor() {
        super("user_assets");
    }

    async getByUserId(userId: string): Promise<UserAssets[]> {
        return this.getByColumn("user_id", userId);
    }

    async getByItemType(
        userId: string,
        itemType: UserAssets["item_type"]
    ): Promise<UserAssets[]> {
        const { data, error } = await this.query
            .select("*")
            .eq("user_id", userId)
            .eq("item_type", itemType);

        if (error) throw error;
        return (data as UserAssets[]) ?? [];
    }
}

export class SubscriptionsRepo extends BaseRepository<Subscriptions> {
    constructor() {
        super("subscriptions");
    }

    async getActiveByUserId(userId: string): Promise<Subscriptions | null> {
        const { data, error } = await this.query
            .select("*")
            .eq("user_id", userId)
            .eq("status", "active")
            .single();

        if (error && error.code !== "PGRST116") throw error;
        return data as Subscriptions | null;
    }
}

export class PurchasesRepo extends BaseRepository<Purchases> {
    constructor() {
        super("purchases");
    }

    async getByUserId(userId: string): Promise<Purchases[]> {
        return this.getByColumn("user_id", userId);
    }
}

export class AppFeedbackRepo extends BaseRepository<AppFeedback> {
    constructor() {
        super("app_feedback");
    }
}

/* ================= SINGLETON INSTANCES ================= */

export const charactersRepo = new CharactersRepo();
export const characterCostumesRepo = new CharacterCostumesRepo();
export const backgroundsRepo = new BackgroundsRepo();
export const mediasRepo = new MediasRepo();
export const mediaCollectionsRepo = new MediaCollectionsRepo();
export const conversationRepo = new ConversationRepo();
export const callsRepo = new CallsRepo();
export const userStatsRepo = new UserStatsRepo();
export const userAssetsRepo = new UserAssetsRepo();
export const subscriptionsRepo = new SubscriptionsRepo();
export const purchasesRepo = new PurchasesRepo();
export const appFeedbackRepo = new AppFeedbackRepo();
