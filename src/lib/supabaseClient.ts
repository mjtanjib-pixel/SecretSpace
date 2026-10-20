import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfig } from '../types';

const STORAGE_KEY_CONFIG = 'secretspace_supabase_config';

export function getStoredConfig(): SupabaseConfig {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const envTurnUrl = (import.meta.env.VITE_TURN_URL || '').trim();
  const envTurnUser = (import.meta.env.VITE_TURN_USERNAME || '').trim();
  const envTurnCred = (import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

  let localConfig: Partial<SupabaseConfig> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      localConfig = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse stored Supabase config', e);
  }

  return {
    supabaseUrl: localConfig.supabaseUrl || envUrl,
    supabaseAnonKey: localConfig.supabaseAnonKey || envKey,
    turnUrl: localConfig.turnUrl || envTurnUrl,
    turnUsername: localConfig.turnUsername || envTurnUser,
    turnCredential: localConfig.turnCredential || envTurnCred,
  };
}

export function saveStoredConfig(config: SupabaseConfig): void {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  // Invalidate cached client to recreate
  activeClient = null;
}

export function isSupabaseConfigured(): boolean {
  const cfg = getStoredConfig();
  return Boolean(
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    cfg.supabaseUrl.startsWith('https://') &&
    cfg.supabaseAnonKey.length > 20
  );
}

let activeClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const cfg = getStoredConfig();
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!activeClient) {
    try {
      activeClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return activeClient;
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!url.startsWith('https://')) {
      return { success: false, message: 'URL must start with https://' };
    }
    const tempClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    const { error } = await tempClient.from('secretspace_rooms').select('count', { count: 'exact', head: true });
    if (error) {
      // If table doesn't exist yet, but authentication reached Supabase, explain
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase! (Note: Tables not created yet. Please execute supabase/schema.sql in Supabase SQL Editor).',
        };
      }
      return { success: false, message: `Supabase error: ${error.message}` };
    }
    return { success: true, message: 'Successfully connected to Supabase database!' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${msg}` };
  }
}
