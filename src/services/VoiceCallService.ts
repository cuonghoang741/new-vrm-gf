import { SUPABASE_URL } from '../config/supabase';
import { getSupabaseAuthHeaders } from '../utils/supabaseHelpers';
import { analyticsService } from './AnalyticsService';

// MARK: - Voice Call Service
/// Service for voice call business logic (database operations, transactions)
export class VoiceCallService {
  // MARK: - Call Row Operations

  async createCallRow(characterId: string, agentId: string): Promise<string | null> {
    try {
      const headers = await getSupabaseAuthHeaders();

      const body: any = {
        character_id: characterId,
        agent_id: agentId || null,
        status: 'ongoing',
        vcoin_spent: 0,
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error('[VoiceCallService] Failed to create call row:', response.status);
        return null;
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].id) {
        // Track call start
        analyticsService.logVoiceCallStart(characterId);
        return data[0].id;
      }
      return null;
    } catch (error) {
      console.error('[VoiceCallService] Error creating call row:', error);
      return null;
    }
  }

  async finalizeCallRow(callId: string, durationSeconds: number, vcoinSpent: number): Promise<void> {
    try {
      if (!callId) {
        return;
      }

      const headers = await getSupabaseAuthHeaders();

      const body = {
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        vcoin_spent: vcoinSpent,
        status: 'ended',
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/calls?id=eq.${callId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error('[VoiceCallService] Failed to finalize call row:', response.status);
      } else {
        // Track call end
        analyticsService.logVoiceCallEnd(durationSeconds);
        // Track spending if any
        if (vcoinSpent > 0) {
          analyticsService.logCurrencySpend(vcoinSpent, 0, 'voice_call');
        }
      }
    } catch (error) {
      console.error('[VoiceCallService] Error finalizing call row:', error);
    }
  }

  // MARK: - Transaction Operations

  async createVoiceCallTransaction(vcoinSpent: number, characterId: string): Promise<void> {
    try {
      if (vcoinSpent <= 0) {
        return;
      }

      const headers = await getSupabaseAuthHeaders();

      const body: any = {
        item_type: 'voice_call',
        item_id: characterId,
        currency_type: 'vcoin',
        amount_paid: vcoinSpent,
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error('[VoiceCallService] Failed to create transaction:', response.status);
      }
    } catch (error) {
      console.error('[VoiceCallService] Error creating transaction:', error);
    }
  }

  // MARK: - Currency Update Operations

  async updateCurrencyBalance(vcoin: number): Promise<void> {
    try {
      const headers = await getSupabaseAuthHeaders();
      const newVcoin = Math.max(0, vcoin);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/user_currency`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vcoin: newVcoin }),
      });

      if (!response.ok) {
        // Fallback to POST upsert
        const postResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/user_currency?on_conflict=user_id,client_id`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal, resolution=merge-duplicates',
            },
            body: JSON.stringify({ vcoin: newVcoin }),
          }
        );

        if (!postResponse.ok) {
          console.error('[VoiceCallService] Failed to update currency:', postResponse.status);
        }
      }
    } catch (error) {
      console.error('[VoiceCallService] Error updating currency:', error);
    }
  }
}

export const voiceCallService = new VoiceCallService();

