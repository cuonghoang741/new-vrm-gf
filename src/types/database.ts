export type UUID = string;
export type Timestamp = string;
export type JSONB = Record<string, any>;

/* ================= CORE ================= */

export interface AppFeedback {
    id: UUID;
    user_id?: UUID;
    client_id?: string;
    character_id: string;
    rating?: number;
    feedback?: string;
    created_at: Timestamp;
}

export interface Backgrounds {
    id: UUID;
    name: string;
    thumbnail?: string;
    image?: string;
    created_at?: Timestamp;
    public?: boolean;
    tier?: "free" | "pro" | "unlimited";
    available?: boolean;
    description?: string;
    rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
    is_dark?: boolean;
    video_url?: string;
}

export interface Calls {
    id: UUID;
    user_id?: UUID;
    client_id?: string;
    character_id: UUID;
    agent_id?: string;
    started_at: Timestamp;
    ended_at?: Timestamp;
    duration_seconds?: number;
    vcoin_spent: number;
    status: string;
    created_at: Timestamp;
    xp_awarded?: boolean;
    relationship_awarded?: boolean;
    call_type?: "voice" | "video";
}

/* ================= CHARACTERS ================= */

export interface Characters {
    id: UUID;
    user_id?: UUID;
    name: string;
    description?: string;
    is_public?: boolean;
    data?: JSONB;
    created_at?: Timestamp;
    thumbnail_url?: string;
    base_model_url?: string;
    order?: string;
    agent_elevenlabs_id?: string;
    avatar?: string;
    small_thumb_url?: string;
    small_avatar?: string;
    tier?: "free" | "pro" | "unlimited";
    available?: boolean;
    default_costume_id?: UUID;
    instruction?: string;
    background_default_id?: UUID;
    video_url?: string;
    total_costumes?: number;
    total_dances?: number;
    total_secrets?: number;
}

export interface CharacterCostumes {
    id: UUID;
    character_id: UUID;
    costume_name: string;
    url: string;
    metadata?: JSONB;
    created_at?: Timestamp;
    thumbnail?: string;
    model_url?: string;
    tier?: "free" | "pro" | "unlimited";
    available?: boolean;
    description?: string;
    streak_days?: number;
    video_url?: string;
}

/* ================= CONVERSATION ================= */

export interface Conversation {
    id: UUID;
    user_id?: UUID;
    client_id?: string;
    character_id: UUID;
    message: string;
    is_agent: boolean;
    created_at: Timestamp;
    is_seen: boolean;
    owner_key?: string;
    xp_awarded?: boolean;
    relationship_awarded?: boolean;
    media_id?: UUID;
}

/* ================= MEDIA ================= */

export interface Medias {
    id: UUID;
    url: string;
    thumbnail?: string;
    character_id?: UUID;
    created_at?: Timestamp;
    tier?: "free" | "pro" | "unlimited";
    available?: boolean;
    content_type?: string;
    rarity?: string;
    relationship_stages_required?: string[];
    unlock_relationship_level?: number;
    media_type?: "photo" | "video" | "dance";
    collection_id?: UUID;
    order_in_collection?: number;
    compressed?: boolean;
}

export interface MediaCollections {
    id: UUID;
    collection_name: string;
    description?: string;
    character_id?: UUID;
    collection_type?: string;
    rarity?: string;
    unlock_requirements?: JSONB;
    thumbnail_url?: string;
    created_at?: Timestamp;
}

/* ================= PURCHASE ================= */

export interface Purchases {
    id: UUID;
    created_at: Timestamp;
    user_id?: UUID;
    client_id?: string;
    platform?: "ios" | "android";
    product_id: string;
    price_cents?: number;
    currency_code?: string;
    metadata?: JSONB;
}

/* ================= USER ================= */

export interface UserStats {
    id: UUID;
    user_id?: UUID;
    client_id?: string;
    level?: number;
    xp?: number;
    energy?: number;
    energy_updated_at?: Timestamp;
    login_streak?: number;
    last_login_date?: string;
    total_logins?: number;
    total_messages_sent?: number;
    total_voice_minutes?: number;
    total_video_minutes?: number;
    created_at?: Timestamp;
    updated_at?: Timestamp;
}

export interface UserAssets {
    id: UUID;
    user_id?: UUID;
    client_id?: string;
    item_type: "character" | "character_costume" | "background" | "media";
    item_id: UUID;
    created_at: Timestamp;
    owner_key?: string;
}

export interface Subscriptions {
    id: UUID;
    user_id: UUID;
    plan: string;
    status: string;
    started_at?: Timestamp;
    expires_at?: Timestamp;
    metadata?: JSONB;
    created_at?: Timestamp;
    tier?: string;
    current_period_end?: Timestamp;
    updated_at?: Timestamp;
}
