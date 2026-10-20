import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  KeyRound,
  UserPlus,
  UserX,
  Trash2,
  Clock,
  Server,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Users,
  Database,
  ArrowRight,
} from 'lucide-react';
import { Participant, UserSession } from '../types';
import {
  updateRetentionHours,
  getInvitedParticipant,
  upsertInvitedParticipant,
  revokeInvitedParticipant,
  changeParticipantPassword,
  clearConversation,
} from '../lib/store';
import {
  getStoredConfig,
  saveStoredConfig,
  testSupabaseConnection,
  isSupabaseConfigured,
} from '../lib/supabaseClient';

interface SettingsModalProps {
  isOpen: boolean;
  session: UserSession;
  currentRetentionHours: number;
  onClose: () => void;
  onRetentionUpdated: (hours: number) => void;
  onConversationCleared: () => void;
  onSwitchUser?: (username: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  session,
  currentRetentionHours,
  onClose,
  onRetentionUpdated,
  onConversationCleared,
  onSwitchUser,
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'credentials' | 'supabase' | 'deployment' | 'simulator'>('room');

  // Retention state
  const [retention, setRetention] = useState(currentRetentionHours);
  const [isUpdatingRetention, setIsUpdatingRetention] = useState(false);

  // Invited participant state (owner only)
  const [invited, setInvited] = useState<Participant | null>(null);
  const [invitedUsername, setInvitedUsername] = useState('');
  const [invitedPassword, setInvitedPassword] = useState('');
  const [isSavingInvited, setIsSavingInvited] = useState(false);
  const [invitedSuccessMsg, setInvitedSuccessMsg] = useState('');

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Supabase config state
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [turnUrl, setTurnUrl] = useState('');
  const [turnUser, setTurnUser] = useState('');
  const [turnCred, setTurnCred] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRetention(currentRetentionHours);
      if (session.role === 'owner') {
        getInvitedParticipant(session.roomId).then(p => {
          setInvited(p);
          if (p) setInvitedUsername(p.username);
        });
      }
      const cfg = getStoredConfig();
      setSupabaseUrl(cfg.supabaseUrl || '');
      setSupabaseKey(cfg.supabaseAnonKey || '');
      setTurnUrl(cfg.turnUrl || '');
      setTurnUser(cfg.turnUsername || '');
      setTurnCred(cfg.turnCredential || '');
    }
  }, [isOpen, session, currentRetentionHours]);

  if (!isOpen) return null;

  const handleRetentionChange = async (hours: number) => {
    setIsUpdatingRetention(true);
    try {
      await updateRetentionHours(session.roomId, hours);
      setRetention(hours);
      onRetentionUpdated(hours);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingRetention(false);
    }
  };

  const handleSaveInvitedParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitedUsername.trim() || !invitedPassword) return;

    setIsSavingInvited(true);
    setInvitedSuccessMsg('');
    try {
      const updated = await upsertInvitedParticipant(
        session.roomId,
        invitedUsername.trim(),
        invitedPassword
      );
      setInvited(updated);
      setInvitedPassword('');
      setInvitedSuccessMsg(`Invited credentials for "${updated.username}" saved successfully!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setInvitedSuccessMsg(`Failed to save: ${msg}`);
    } finally {
      setIsSavingInvited(false);
    }
  };

  const handleRevokeInvited = async () => {
    if (window.confirm('Revoke invited participant access immediately? They will not be able to log in.')) {
      await revokeInvitedParticipant(session.roomId);
      const updated = await getInvitedParticipant(session.roomId);
      setInvited(updated);
      setInvitedSuccessMsg('Invited participant access revoked.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMsg(null);
    if (newPassword.length < 8) {
      setPasswordChangeMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    try {
      await changeParticipantPassword(session.participantId, newPassword);
      setPasswordChangeMsg({ type: 'success', text: 'Password changed successfully.' });
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPasswordChangeMsg({ type: 'error', text: `Failed: ${msg}` });
    }
  };

  const handleClearConversation = async () => {
    if (window.confirm('PERMANENT WIPE: Are you sure you want to delete ALL messages in this room? This action cannot be undone.')) {
      await clearConversation(session.roomId);
      onConversationCleared();
      onClose();
    }
  };

  const handleSaveSupabaseConfig = () => {
    saveStoredConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseKey.trim(),
      turnUrl: turnUrl.trim(),
      turnUsername: turnUser.trim(),
      turnCredential: turnCred.trim(),
    });
    alert('Configuration saved! The application will use these settings for database and media storage.');
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    const res = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());
    setTestResult(res);
    setIsTestingConn(false);
  };

  const handleCopySql = () => {
    const sqlText = `-- SecretSpace Schema
-- Run in Supabase SQL Editor:
-- Copy from supabase/schema.sql in the project root
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.secretspace_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'SecretSpace Private Room',
    retention_hours INTEGER NOT NULL DEFAULT 24,
    max_unread_days INTEGER NOT NULL DEFAULT 30,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.secretspace_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'invited')),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_room_role UNIQUE (room_id, role)
);

CREATE TABLE IF NOT EXISTS public.secretspace_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'audio')),
    attachment_url TEXT,
    attachment_meta JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.secretspace_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    from_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    to_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.secretspace_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.secretspace_signals;

INSERT INTO storage.buckets (id, name, public) VALUES ('secretspace-media', 'secretspace-media', false)
ON CONFLICT (id) DO NOTHING;`;

    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-base text-white">SecretSpace Controls & Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center border-b border-neutral-800 px-6 bg-neutral-950/40 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('room')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'room'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Room & Retention
          </button>

          {session.role === 'owner' && (
            <button
              onClick={() => setActiveTab('credentials')}
              className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'credentials'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Invited Participant
            </button>
          )}

          <button
            onClick={() => setActiveTab('supabase')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'supabase'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Supabase & TURN</span>
          </button>

          <button
            onClick={() => setActiveTab('deployment')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'deployment'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Vercel Deploy Guide</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>2-User Test Sandbox</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Room & Retention */}
          {activeTab === 'room' && (
            <div className="space-y-6">
              {/* Retention selection */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Message Retention & Auto-Deletion Period
                  </h3>
                </div>
                <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
                  The countdown starts the moment the recipient reads a message. When the period ends, the message and its media attachments are automatically wiped from the database.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { hours: 1, label: '1 Hour' },
                    { hours: 24, label: '24 Hours (Default)' },
                    { hours: 168, label: '7 Days' },
                    { hours: 720, label: '30 Days' },
                  ].map(option => (
                    <button
                      key={option.hours}
                      type="button"
                      disabled={isUpdatingRetention}
                      onClick={() => handleRetentionChange(option.hours)}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        retention === option.hours
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-xs">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Password Change */}
              <div className="pt-4 border-t border-neutral-800">
                <div className="flex items-center gap-2 mb-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Change My Password
                  </h3>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {passwordChangeMsg && (
                    <div
                      className={`text-xs p-2.5 rounded-lg ${
                        passwordChangeMsg.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {passwordChangeMsg.text}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="password"
                      placeholder="New password (min 8 chars)"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {/* Danger Zone: Clear Conversation */}
              <div className="pt-4 border-t border-rose-950/40">
                <h3 className="text-sm font-semibold text-rose-400 mb-1 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Danger Zone
                </h3>
                <p className="text-xs text-neutral-400 mb-3">
                  Wipes all message history and attachment records for both participants immediately.
                </p>
                <button
                  type="button"
                  onClick={handleClearConversation}
                  className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Clear Entire Conversation
                </button>
              </div>

              {/* Retention Disclosure Notice */}
              <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded-xl text-[11px] text-neutral-400 leading-relaxed">
                <span className="font-semibold text-neutral-300">Privacy Notice:</span> Automatic deletion securely deletes database records and private cloud storage attachments. Note that automatic deletion cannot prevent another participant from taking manual screenshots or downloading files while the message is visible.
              </div>
            </div>
          )}

          {/* TAB 2: Invited Participant Management */}
          {activeTab === 'credentials' && session.role === 'owner' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                  Manage Invited Participant Access
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                  SecretSpace strictly allows exactly one invited participant. You can set their username and private access code below, rotate it whenever needed, or revoke their access immediately.
                </p>

                {invited && (
                  <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl mb-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-200">{invited.username}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            invited.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {invited.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {invited.lastSeenAt ? `Last active: ${new Date(invited.lastSeenAt).toLocaleString()}` : 'Never logged in'}
                      </p>
                    </div>

                    {invited.isActive && (
                      <button
                        type="button"
                        onClick={handleRevokeInvited}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-500/30"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Revoke Access</span>
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleSaveInvitedParticipant} className="space-y-3 bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl">
                  <h4 className="text-xs font-semibold text-neutral-300">
                    {invited ? 'Rotate / Update Credentials' : 'Create Invited Credentials'}
                  </h4>

                  {invitedSuccessMsg && (
                    <div className="text-xs p-2.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      {invitedSuccessMsg}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Assigned Username</label>
                      <input
                        type="text"
                        required
                        value={invitedUsername}
                        onChange={e => setInvitedUsername(e.target.value)}
                        placeholder="e.g. bob"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Private Access Code / Password</label>
                      <input
                        type="password"
                        required
                        value={invitedPassword}
                        onChange={e => setInvitedPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingInvited}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Save Invited Credentials</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: Supabase & TURN Configuration */}
          {activeTab === 'supabase' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">Supabase & TURN Settings</h3>
                  <p className="text-xs text-neutral-400">
                    Connect your Supabase project URL and Anon key for production database and private storage.
                  </p>
                </div>
                <div
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    isSupabaseConfigured()
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {isSupabaseConfigured() ? 'Supabase Active' : 'Sandbox Fallback'}
                </div>
              </div>

              {testResult && (
                <div
                  className={`text-xs p-3 rounded-xl border ${
                    testResult.success
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <div className="space-y-3 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                    Supabase Project URL (VITE_SUPABASE_URL)
                  </label>
                  <input
                    type="text"
                    value={supabaseUrl}
                    onChange={e => setSupabaseUrl(e.target.value)}
                    placeholder="https://xyzabcdefg.supabase.co"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                    Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY)
                  </label>
                  <input
                    type="password"
                    value={supabaseKey}
                    onChange={e => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* TURN config */}
                <div className="pt-2 border-t border-neutral-800/80">
                  <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                    (Optional) TURN Server URL (For restrictive corporate firewalls)
                  </label>
                  <input
                    type="text"
                    value={turnUrl}
                    onChange={e => setTurnUrl(e.target.value)}
                    placeholder="turn:turn.example.com:3478"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConn || !supabaseUrl.trim()}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {isTestingConn ? 'Testing...' : 'Test Connection'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveSupabaseConfig}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>

              {/* SQL Migration Quick Copy */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-200">Supabase SQL Schema</span>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Execute this SQL in Supabase Dashboard &gt; SQL Editor to set up rooms, messages, RLS policies, and media buckets.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: Vercel Deployment Guide */}
          {activeTab === 'deployment' && (
            <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
              <h3 className="text-sm font-semibold text-neutral-100">
                Beginner&apos;s Step-by-Step Deployment Guide
              </h3>

              <div className="space-y-3">
                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 1: Create Supabase Project</h4>
                  <p className="text-neutral-400">
                    Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3" /></a>, sign up, and click <strong>New Project</strong>. Choose a name and database password.
                  </p>
                </div>

                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 2: Run SQL Schema in Supabase</h4>
                  <p className="text-neutral-400">
                    In your Supabase project, click <strong>SQL Editor</strong> on the left menu, click <strong>New Query</strong>, paste the content of <code>supabase/schema.sql</code>, and click <strong>Run</strong>. This creates all tables, RLS security rules, and the private <code>secretspace-media</code> bucket.
                  </p>
                </div>

                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 3: Get Supabase API Keys</h4>
                  <p className="text-neutral-400">
                    In Supabase, navigate to <strong>Project Settings &gt; API</strong>. Copy your <strong>Project URL</strong> and <strong>anon / public key</strong>.
                  </p>
                </div>

                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 4: Push to GitHub & Connect to Vercel</h4>
                  <ol className="list-decimal list-inside space-y-1 text-neutral-400 mt-1">
                    <li>Create a new private repository on GitHub and push the code.</li>
                    <li>Go to <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline inline-flex items-center gap-0.5">vercel.com <ExternalLink className="w-3 h-3" /></a> and click <strong>Add New &gt; Project</strong>.</li>
                    <li>Import your GitHub repository.</li>
                    <li>Under <strong>Environment Variables</strong>, add:
                      <ul className="list-disc list-inside ml-4 mt-1 font-mono text-[11px] text-neutral-300">
                        <li><code>VITE_SUPABASE_URL</code></li>
                        <li><code>VITE_SUPABASE_ANON_KEY</code></li>
                      </ul>
                    </li>
                    <li>Click <strong>Deploy</strong>. Vercel will build and assign you a permanent production URL!</li>
                  </ol>
                </div>

                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 5: Testing with Two Devices</h4>
                  <p className="text-neutral-400">
                    Open the deployed URL on device A (or browser window A). Complete Owner setup. In Settings &gt; Invited Participant, create credentials for Participant B. Open the URL on device B (or an incognito window), and log in as Participant B. You can now chat, send photos, record voice notes, and test WebRTC calls!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: 2-User Sandbox Simulator */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-neutral-100">
                  Interactive 2-Participant Testing Sandbox
                </h3>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Test offline messaging, read receipts, and WebRTC signaling directly inside AI Studio without needing a second device:
              </p>

              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-300">Current Logged In User:</span>
                  <span className="font-semibold text-emerald-400">
                    {session.username} ({session.role.toUpperCase()})
                  </span>
                </div>

                <div className="pt-2 border-t border-neutral-800 text-xs space-y-2">
                  <p className="text-neutral-400">
                    How to test <strong>Offline Messaging</strong>:
                  </p>
                  <ol className="list-decimal list-inside text-neutral-400 space-y-1 text-[11px]">
                    <li>Send a message as the current participant. Notice the single checkmark (sent).</li>
                    <li>Log out or switch to the other participant.</li>
                    <li>When the other participant logs in, the message is marked delivered and read (double tick), and the auto-retention countdown starts!</li>
                  </ol>
                </div>

                {onSwitchUser && invited && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onSwitchUser(session.role === 'owner' ? invited.username : 'owner')}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>Switch Session to {session.role === 'owner' ? `Invited Participant (${invited.username})` : 'Room Owner'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
