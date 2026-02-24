import {
    charactersRepo,
    characterCostumesRepo,
} from "../repositories";
import { Characters, CharacterCostumes } from "../types/database";

export class CharacterService {
    async getPublicCharacters(): Promise<Characters[]> {
        return charactersRepo.getPublicCharacters();
    }

    async getCharacterById(id: string): Promise<Characters | null> {
        return charactersRepo.getById(id);
    }

    async getCharacterCostumes(characterId: string): Promise<CharacterCostumes[]> {
        return characterCostumesRepo.getByCharacterId(characterId);
    }
}

export const characterService = new CharacterService();
