import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, Trash2, Copy, Shield, Image as ImageIcon } from 'lucide-react';
import { Message, UserSession } from '../types';
import { AudioPlayer } from './AudioPlayer';

interface MessageListProps {
  messages: Message[];
  session: UserSession;
  retentionHours: number;
  onDeleteMessage: (messageId: string) => void;
  onOpenImageModal: (url: string, messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  session,
  retentionHours,
  onDeleteMessage,
  onOpenImageModal,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getExpirationRemaining = (expiresAt?: string | null) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expiring...';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d left`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  };

  const renderStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-neutral-400 animate-pulse" />;
      case 'sent':
        return (
          <span title="Sent to server">
            <Check className="w-3.5 h-3.5 text-neutral-400" />
          </span>
        );
      case 'delivered':
        return (
          <span title="Delivered">
            <CheckCheck className="w-3.5 h-3.5 text-neutral-400" />
          </span>
        );
      case 'read':
        return (
          <span title="Read by recipient">
            <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Privacy banner / Encryption notice */}
      <div className="max-w-md mx-auto my-2 p-3 bg-neutral-900/60 border border-neutral-800/80 rounded-xl text-center select-none shadow-xs">
        <div className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 mb-1.5">
          <Shield className="w-4 h-4" />
        </div>
        <p className="text-xs font-medium text-neutral-200">
          SecretSpace Private 2-Person Session
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">
          Messages auto-delete {retentionHours}h after being read by recipient. Offline messages persist securely until delivered.
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center text-neutral-400">
          <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-3 text-neutral-400">
            <ImageIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-neutral-300">No messages in room</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-xs">
            Send a text, share a photo, record a voice note, or start an encrypted WebRTC call above.
          </p>
        </div>
      ) : (
        messages.map(msg => {
          const isOutgoing = msg.senderId === session.participantId;
          const timeLeft = getExpirationRemaining(msg.expiresAt);

          return (
            <div
              key={msg.id}
              className={`flex flex-col group ${isOutgoing ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble Container */}
              <div className="relative max-w-[85%] sm:max-w-[70%]">
                <div
                  className={`rounded-2xl transition-all duration-150 shadow-md ${
                    isOutgoing
                      ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-tr-xs'
                      : 'bg-neutral-800/90 text-neutral-100 rounded-tl-xs border border-neutral-700/60'
                  }`}
                >
                  {/* Sender tag if incoming */}
                  {!isOutgoing && (
                    <div className="px-3.5 pt-2 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                      {msg.senderRole === 'owner' ? 'Owner' : 'Participant'}
                    </div>
                  )}

                  {/* Message Content: Image */}
                  {msg.messageType === 'image' && msg.attachmentUrl && (
                    <div className="p-1.5">
                      <div
                        onClick={() => onOpenImageModal(msg.attachmentUrl!, msg.id)}
                        className="cursor-pointer overflow-hidden rounded-xl bg-black/40 relative group/img aspect-auto max-h-[360px]"
                      >
                        <img
                          src={msg.attachmentUrl}
                          alt="Attachment"
                          className="object-cover max-h-[360px] w-full rounded-xl hover:scale-[1.01] transition-transform duration-200"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-xs bg-black/70 text-white px-2 py-1 rounded-md backdrop-blur-xs">
                            View Fullscreen
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Message Content: Audio Voice Note */}
                  {msg.messageType === 'audio' && msg.attachmentUrl && (
                    <div className="p-2">
                      <AudioPlayer
                        src={msg.attachmentUrl}
                        duration={msg.attachmentMeta?.duration}
                        isOutgoing={isOutgoing}
                      />
                    </div>
                  )}

                  {/* Message Content: Text */}
                  {msg.messageType === 'text' && (
                    <div className="px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words selection:bg-black/30">
                      {msg.content}
                    </div>
                  )}

                  {/* Metadata Row: Time, Expiration timer, Status */}
                  <div
                    className={`px-3.5 pb-2 pt-0.5 flex items-center justify-end gap-1.5 text-[10px] select-none ${
                      isOutgoing ? 'text-emerald-100/80' : 'text-neutral-400'
                    }`}
                  >
                    {/* Expiration countdown badge */}
                    {timeLeft && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-mono text-[9px] ${
                          isOutgoing
                            ? 'bg-emerald-800/60 text-emerald-100'
                            : 'bg-neutral-700/80 text-amber-300'
                        }`}
                        title="Auto-deletes when retention period completes"
                      >
                        <Clock className="w-2.5 h-2.5" />
                        <span>{timeLeft}</span>
                      </span>
                    )}

                    {/* Timestamp */}
                    <span>{formatMessageTime(msg.createdAt)}</span>

                    {/* Status tick for outgoing */}
                    {isOutgoing && renderStatusIcon(msg.status)}
                  </div>
                </div>

                {/* Hover / Quick Action controls */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ${
                    isOutgoing ? '-left-16' : '-right-16'
                  }`}
                >
                  {msg.messageType === 'text' && (
                    <button
                      onClick={() => handleCopyText(msg.content, msg.id)}
                      className="p-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
                      title={copiedId === msg.id ? 'Copied!' : 'Copy Text'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (window.confirm('Delete this message permanently for both participants?')) {
                        onDeleteMessage(msg.id);
                      }
                    }}
                    className="p-1 rounded-md bg-neutral-800 hover:bg-rose-900/60 text-neutral-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="Delete message"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
};
