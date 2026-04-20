import { supabase } from '../config/supabase';

interface Character {
    id: string;
    name: string;
    base_model_url?: string;
    thumbnail_url?: string;
    agent_elevenlabs_id?: string;
    background_default_id?: string;
}

export class CharacterRepository {
    /**
     * Fetch a single character by ID.
     */
    async fetchCharacter(characterId: string): Promise<Character | null> {
        try {
            const { data, error } = await supabase
                .from('characters')
                .select('id, name, base_model_url, thumbnail_url, agent_elevenlabs_id, background_default_id')
                .eq('id', characterId)
                .single();

            if (error || !data) return null;
            return data as Character;
        } catch (error) {
            console.error('[CharacterRepository] fetchCharacter error:', error);
            return null;
        }
    }
}
