import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '../logger';
import { DelveClient, delveClient } from './client';
import {
  DelveAgentConfigRecord,
  DelveClientError,
  RegisterAgentResponse,
  RegistrationResult,
  RegistrationStatus,
  RegistrationStatusResult,
  RetryConfig,
} from './types';

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 60_000;

type SupabaseError = {
  message: string;
  details?: string | null;
  code?: string | null;
  hint?: string | null;
};

type ResolvedRetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
};


const logger = createLogger('DelveRegistration');

const buildResolvedConfig = (config?: RetryConfig): ResolvedRetryConfig => ({
  maxAttempts: config?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  baseDelayMs: config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  maxDelayMs: config?.maxDelayMs,
});

export class DelveRegistrationService {
  private readonly supabase: SupabaseClient;
  private readonly delveClient: DelveClient;
  private readonly retryConfig: ResolvedRetryConfig;

  constructor(
    client: DelveClient = delveClient,
    retryConfig: RetryConfig = {},
  ) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase credentials for Delve registration.');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    this.delveClient = client;
    this.retryConfig = buildResolvedConfig(retryConfig);
  }

  async registerAgent(
    agentId: string,
    bonfireId: string,
  ): Promise<RegistrationResult> {
    logger.info('Registering Delve agent', { agentId, bonfireId });

    const { record, error: fetchError } = await this.fetchAgentConfig(agentId);
    if (fetchError) {
      logger.error('Failed to fetch registration record', {
        agentId,
        bonfireId,
        error: fetchError.message,
        details: fetchError.details,
        code: fetchError.code,
      });
      return { success: false, error: 'Failed to load registration record.' };
    }

    if (!record) {
      const now = new Date().toISOString();
      const insertResult = await this.insertAgentConfig({
        agent_id: agentId,
        bonfire_id: bonfireId,
        registration_status: 'pending',
        registration_error: null,
        delve_agent_id: null,
        registered_at: null,
        created_at: now,
        updated_at: now,
        attempt_count: 0,
      });

      if (insertResult.error) {
        logger.error('Failed to insert registration record', {
          agentId,
          bonfireId,
          error: insertResult.error.message,
          details: insertResult.error.details,
          code: insertResult.error.code,
        });
        return { success: false, error: 'Failed to initialize registration.' };
      }
    }

    try {
      const response: RegisterAgentResponse =
        await this.delveClient.registerAgent(agentId, bonfireId);
      const registeredAgentId = response.agent_id ?? null;

      await this.updateRegistrationStatus(agentId, {
        registration_status: 'registered',
        registration_error: null,
        delve_agent_id: registeredAgentId,
        registered_at: new Date().toISOString(),
      });

      return {
        success: true,
        delveAgentId: registeredAgentId ?? undefined,
      };
    } catch (error: unknown) {
      if (error instanceof DelveClientError) {
        const attemptCount = this.getNextAttemptCount(
          record?.attempt_count,
          !record,
        );
        const failureUpdates: Partial<DelveAgentConfigRecord> = {
          registration_status: 'failed',
          registration_error: error.message,
        };

        if (attemptCount !== null) {
          failureUpdates.attempt_count = attemptCount;
        }

        logger.error('Delve registration failed', {
          agentId,
          bonfireId,
          message: error.message,
          statusCode: error.statusCode,
          errorCode: error.errorCode,
          details: error.details,
        });

        await this.updateRegistrationStatus(agentId, failureUpdates);
        return { success: false, error: error.message };
      }

      const message =
        error instanceof Error ? error.message : 'Unexpected error occurred.';
      logger.error('Unexpected error during registration', {
        agentId,
        bonfireId,
        message,
      });

      await this.updateRegistrationStatus(agentId, {
        registration_status: 'failed',
        registration_error: message,
      });

      return { success: false, error: message };
    }
  }

  async retryFailedRegistrations(): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
  }> {
    const results = { attempted: 0, succeeded: 0, failed: 0 };
    logger.info('Retrying failed Delve registrations');

    const { records, error } = await this.fetchRetryCandidates(
      this.retryConfig.maxAttempts,
    );

    if (error) {
      logger.error('Failed to fetch retry candidates', {
        error: error.message,
        details: error.details,
        code: error.code,
      });
      return results;
    }

    if (records.length === 0) {
      logger.info('No pending or failed registrations to retry');
      return results;
    }

    for (const record of records) {
      const currentAttemptCount = record.attempt_count ?? 0;
      if (currentAttemptCount >= this.retryConfig.maxAttempts) {
        continue;
      }

      const attemptNumber = currentAttemptCount + 1;
      const backoffDelayMs = this.calculateBackoffDelay(attemptNumber);
      const lastAttemptAt = record.updated_at
        ? new Date(record.updated_at).getTime()
        : 0;

      if (lastAttemptAt && Date.now() - lastAttemptAt < backoffDelayMs) {
        continue;
      }

      await this.updateRegistrationStatus(record.agent_id, {
        attempt_count: attemptNumber,
      });

      results.attempted += 1;
      const retryResult = await this.registerAgent(
        record.agent_id,
        record.bonfire_id ?? '',
      );

      if (retryResult.success) {
        results.succeeded += 1;
      } else {
        results.failed += 1;
      }

      await this.sleep(1000);
    }

    logger.info('Completed Delve retry batch', results);
    return results;
  }

  async getRegistrationStatus(agentId: string): Promise<RegistrationStatusResult> {
    const { record, error } = await this.fetchAgentConfig(agentId, true);

    if (error) {
      if (error.code === 'PGRST116') {
        return { status: 'not_found' };
      }

      logger.error('Failed to fetch registration status', {
        agentId,
        error: error.message,
        details: error.details,
        code: error.code,
      });

      return { status: 'failed', error: 'Failed to load registration status.' };
    }

    if (!record) {
      return { status: 'not_found' };
    }

    return {
      status: record.registration_status,
      delveAgentId: record.delve_agent_id ?? undefined,
      error: record.registration_error ?? undefined,
      registeredAt: record.registered_at ?? undefined,
    };
  }

  private calculateBackoffDelay(attempt: number): number {
    const safeAttempt = Math.max(attempt, 1);
    const delay =
      this.retryConfig.baseDelayMs * Math.pow(2, safeAttempt - 1);
    if (this.retryConfig.maxDelayMs !== undefined) {
      return Math.min(delay, this.retryConfig.maxDelayMs);
    }
    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private getNextAttemptCount(
    currentCount?: number | null,
    assumeInitial = false,
  ): number | null {
    if (typeof currentCount === 'number') {
      return currentCount + 1;
    }
    return assumeInitial ? 1 : null;
  }

  private async fetchAgentConfig(
    agentId: string,
    useSingle = false,
  ): Promise<{
    record: DelveAgentConfigRecord | null;
    error: SupabaseError | null;
  }> {
    const query = this.supabase
      .from('delve_agent_config')
      .select('*')
      .eq('agent_id', agentId);

    const { data, error } = useSingle
      ? await query.single()
      : await query.maybeSingle();

    return {
      record: (data as DelveAgentConfigRecord | null) ?? null,
      error: error ?? null,
    };
  }

  private async insertAgentConfig(
    record: DelveAgentConfigRecord,
  ): Promise<{ error: SupabaseError | null }> {
    const { error } = await this.supabase
      .from('delve_agent_config')
      .insert([record]);

    if (error && this.isMissingColumnError(error, 'attempt_count')) {
      const { attempt_count: _attemptCount, ...safeRecord } = record;
      const retryResult = await this.supabase
        .from('delve_agent_config')
        .insert([safeRecord]);

      if (retryResult.error) {
        return { error: retryResult.error };
      }

      logger.warn(
        'attempt_count column missing, inserted without attempt tracking',
        { agentId: record.agent_id },
      );
      return { error: null };
    }

    return { error: error ?? null };
  }

  private async updateRegistrationStatus(
    agentId: string,
    updates: Partial<DelveAgentConfigRecord>,
  ): Promise<void> {
    const updatePayload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from('delve_agent_config')
      .update(updatePayload)
      .eq('agent_id', agentId);

    if (!error) {
      return;
    }

    if (this.isMissingColumnError(error, 'attempt_count')) {
      const { attempt_count: _attemptCount, ...safeUpdates } = updatePayload;
      const retryResult = await this.supabase
        .from('delve_agent_config')
        .update(safeUpdates)
        .eq('agent_id', agentId);

      if (retryResult.error) {
        logger.error('Failed to update registration status', {
          agentId,
          error: retryResult.error.message,
          details: retryResult.error.details,
          code: retryResult.error.code,
        });
        return;
      }

      logger.warn(
        'attempt_count column missing, updated without attempt tracking',
        { agentId },
      );
      return;
    }

    logger.error('Failed to update registration status', {
      agentId,
      error: error.message,
      details: error.details,
      code: error.code,
    });
  }

  private async fetchRetryCandidates(
    maxAttempts: number,
  ): Promise<{
    records: DelveAgentConfigRecord[];
    error: SupabaseError | null;
  }> {
    const query = this.supabase
      .from('delve_agent_config')
      .select('*')
      .in('registration_status', ['pending', 'failed'])
      .or(`attempt_count.is.null,attempt_count.lt.${maxAttempts}`);

    const { data, error } = await query;

    if (error && this.isMissingColumnError(error, 'attempt_count')) {
      const fallbackQuery = this.supabase
        .from('delve_agent_config')
        .select('*')
        .in('registration_status', ['pending', 'failed']);

      const fallback = await fallbackQuery;
      if (fallback.error) {
        return { records: [], error: fallback.error };
      }

      logger.warn(
        'attempt_count column missing, retrying without attempt filters',
      );
      return {
        records: (fallback.data as DelveAgentConfigRecord[]) ?? [],
        error: null,
      };
    }

    return {
      records: (data as DelveAgentConfigRecord[]) ?? [],
      error: error ?? null,
    };
  }

  private isMissingColumnError(
    error: SupabaseError | null,
    columnName: string,
  ): boolean {
    if (!error) {
      return false;
    }

    const message = `${error.message} ${error.details ?? ''}`.toLowerCase();
    return message.includes(columnName.toLowerCase());
  }
}

export const delveRegistrationService = new DelveRegistrationService();
