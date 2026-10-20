import React from 'react';
import { Shield, Phone, Video, Settings, LogOut, Clock } from 'lucide-react';
import { Participant, UserSession } from '../types';

interface ChatHeaderProps {
  session: UserSession;
  otherParticipant: Participant | null;
  retentionHours: number;
  isPeerOnline: boolean;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  session,
  otherParticipant,
  retentionHours,
  isPeerOnline,
  onStartAudioCall,
  onStartVideoCall,
  onOpenSettings,
  onLogout,
}) => {
  const formatRetentionLabel = (hours: number) => {
    if (hours === 1) return '1h';
    if (hours === 24) return '24h';
    if (hours === 168) return '7 days';
    if (hours === 720) return '30 days';
    return `${hours}h`;
  };

  const getPeerDisplayName = () => {
    if (!otherParticipant) {
      return session.role === 'owner' ? 'Invited Participant (Not Set)' : 'Room Owner';
    }
    return otherParticipant.username;
  };

  const getLastSeenText = () => {
    if (isPeerOnline) return 'Online';
    if (!otherParticipant?.lastSeenAt) return 'Offline';

    const diffMs = Date.now() - new Date(otherParticipant.lastSeenAt).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Active just now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    return 'Offline';
  };

  return (
    <header className="h-16 px-3 sm:px-6 bg-neutral-900/95 border-b border-neutral-800/80 backdrop-blur-md flex items-center justify-between shrink-0 select-none z-20">
      {/* Left: Branding & Peer Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-950 border border-neutral-700/60 flex items-center justify-center text-emerald-400 shadow-inner">
            <Shield className="w-5 h-5" />
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 transition-colors ${
              isPeerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
            }`}
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-neutral-100 truncate">
              {getPeerDisplayName()}
            </span>
            <span className="hidden sm:inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.2 bg-neutral-800 text-neutral-400 rounded">
              {session.role === 'owner' ? 'Peer' : 'Owner'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className={isPeerOnline ? 'text-emerald-400 font-medium' : 'text-neutral-400'}>
              {getLastSeenText()}
            </span>
            <span className="text-neutral-600">&bull;</span>
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatRetentionLabel(retentionHours)} retention</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Audio Call Button */}
        <button
          onClick={onStartAudioCall}
          title="Start Encrypted Audio Call (WebRTC)"
          className="p-2 sm:px-3 sm:py-2 rounded-xl text-neutral-300 hover:text-emerald-400 hover:bg-neutral-800/80 transition-all flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-neutral-700"
        >
          <Phone className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline text-xs font-medium">Audio Call</span>
        </button>

        {/* Video Call Button */}
        <button
          onClick={onStartVideoCall}
          title="Start Encrypted Video Call (WebRTC)"
          className="p-2 sm:px-3 sm:py-2 rounded-xl text-neutral-300 hover:text-teal-400 hover:bg-neutral-800/80 transition-all flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-neutral-700"
        >
          <Video className="w-4 h-4 text-teal-400" />
          <span className="hidden md:inline text-xs font-medium">Video Call</span>
        </button>

        <div className="h-5 w-[1px] bg-neutral-800 mx-1 hidden sm:block" />

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Room Settings & Credentials"
          className="p-2 rounded-xl text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          title="End Session & Logout"
          className="p-2 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
