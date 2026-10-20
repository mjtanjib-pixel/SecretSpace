import React, { useState } from 'react';
import { Lock, Shield, Eye, EyeOff, KeyRound, Server, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { initializeOwner, login } from '../lib/store';
import { UserSession } from '../types';
import { isSupabaseConfigured } from '../lib/supabaseClient';

interface AuthScreenProps {
  isInitialized: boolean;
  onAuthenticated: (session: UserSession) => void;
  onOpenSetupGuide: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isInitialized,
  onAuthenticated,
  onOpenSetupGuide,
}) => {
  const [isSetupMode, setIsSetupMode] = useState(!isInitialized);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const supabaseActive = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    if (isSetupMode) {
      if (password.length < 8) {
        setErrorMessage('Owner master password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isSetupMode) {
        const session = await initializeOwner(username.trim(), password);
        onAuthenticated(session);
      } else {
        const session = await login(username.trim(), password);
        onAuthenticated(session);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header / Database status indicator */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between text-xs text-neutral-400 pt-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${supabaseActive ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-amber-500'}`} />
          <span>{supabaseActive ? 'Supabase Live Connected' : 'Local Sandbox Engine'}</span>
        </div>
        <button
          onClick={onOpenSetupGuide}
          className="flex items-center gap-1.5 text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer py-1 px-2 rounded-md hover:bg-neutral-900"
        >
          <Server className="w-3.5 h-3.5" />
          <span>Setup & Deployment Guide</span>
        </button>
      </div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Brand Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400 mb-4 shadow-inner">
              <Shield className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              SecretSpace
              <span className="text-[10px] font-semibold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                2-Peer Private
              </span>
            </h1>
            <p className="text-xs text-neutral-400 mt-2 max-w-xs mx-auto">
              {isSetupMode
                ? 'Create the owner master credentials to initialize your private 2-person room.'
                : 'Enter your unique participant credentials to access the encrypted conversation.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                {isSetupMode ? 'Owner Username' : 'Participant Username / ID'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={isSetupMode ? 'e.g. alice' : 'Enter assigned username'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  {isSetupMode ? 'Create Master Password' : 'Password / Access Code'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                />
              </div>
              {isSetupMode && (
                <p className="text-[11px] text-neutral-400 mt-1">
                  At least 8 characters. Hashed via PBKDF2 with 100,000 rounds. Never stored in plaintext.
                </p>
              )}
            </div>

            {isSetupMode && (
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Confirm Master Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSetupMode ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Initialize Private Room</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Enter SecretSpace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle setup mode if uninitialized or testing */}
          {!isInitialized && (
            <div className="mt-6 pt-5 border-t border-neutral-800/80 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSetupMode(!isSetupMode);
                  setErrorMessage('');
                }}
                className="text-xs text-neutral-400 hover:text-emerald-400 transition-colors"
              >
                {isSetupMode ? 'Already initialized? Switch to Login' : 'First time? Initialize Room as Owner'}
              </button>
            </div>
          )}

          {/* Security details disclosure */}
          <div className="mt-6 pt-4 border-t border-neutral-800/40 text-[11px] text-neutral-400 space-y-1">
            <div className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
              <span>Strict 2-person limit. Public signups disabled.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
              <span>Auto-retention wipes read messages after configured timeout.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-md mx-auto text-center text-[11px] text-neutral-400 pb-2">
        SecretSpace Private Web Application &bull; Dual-Peer Architecture
      </div>
    </div>
  );
};
