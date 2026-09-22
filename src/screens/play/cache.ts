/** Shape of the last-character snapshot PlayScreen keeps in SecureStore. */
export interface CachedCharacter {
    characterId: string;
    characterName: string;
    modelUrl: string;
    backgroundUrl: string | null;
    backgroundId: string | null;
    thumbnailUrl?: string | null;
    avatarUrl?: string | null;
    smallThumbUrl?: string | null;
    smallAvatarUrl?: string | null;
    agentElevenlabsId?: string | null;
    isBackgroundDark?: boolean;
}
