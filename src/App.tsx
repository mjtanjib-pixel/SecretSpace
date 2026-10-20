import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  isRoomInitialized,
  getActiveSession,
  logout,
  getRoom,
  fetchMessages,
  sendMessage,
  deleteMessage,
  clearConversation,
  uploadMedia,
  subscribeToRealtime,
  getOtherParticipant,
  filterExpiredMessages,
} from './lib/store';
import { Message, Participant, Room, UserSession, CallType, WebRTCSignalData } from './types';
import { WebRTCManager } from './lib/webrtc';
import { AuthScreen } from './components/AuthScreen';
import { ChatHeader } from './components/ChatHeader';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { CallModal } from './components/CallModal';
import { ImageModal } from './components/ImageModal';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [retentionHours, setRetentionHours] = useState<number>(24);
  const [isPeerOnline, setIsPeerOnline] = useState<boolean>(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [activeImageMessageId, setActiveImageMessageId] = useState<string | null>(null);

  // WebRTC Call state
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected'>('idle');
  const [callType, setCallType] = useState<CallType>('video');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState<string>('');
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | undefined>(undefined);

  const rtcManagerRef = useRef<WebRTCManager | null>(null);

  // 1. Initial Room & Session Check
  const checkInitialState = useCallback(async () => {
    try {
      const { initialized, room: currentRoom } = await isRoomInitialized();
      setIsInitialized(initialized);
      if (currentRoom) {
        setRoom(currentRoom);
        setRetentionHours(currentRoom.retentionHours || 24);
      }
      const active = getActiveSession();
      if (active) {
        setSession(active);
      }
    } catch (e) {
      console.error('Error checking room initialization:', e);
      setIsInitialized(false);
    }
  }, []);

  useEffect(() => {
    checkInitialState();
  }, [checkInitialState]);

  // 2. Load participants, room data, and messages when session is active
  const loadChatData = useCallback(async () => {
    if (!session) return;
    try {
      const roomData = await getRoom(session.roomId);
      if (roomData) {
        setRoom(roomData);
        setRetentionHours(roomData.retentionHours);
      }

      const peer = await getOtherParticipant(session.roomId, session.participantId);
      setOtherParticipant(peer);

      // Check if peer was active in last 60 seconds
      if (peer?.lastSeenAt) {
        const diff = Date.now() - new Date(peer.lastSeenAt).getTime();
        setIsPeerOnline(diff < 60000);
      } else {
        setIsPeerOnline(false);
      }

      // Fetch messages with read receipt & retention check
      const currentRetention = roomData?.retentionHours || retentionHours;
      const msgs = await fetchMessages(session.roomId, session.participantId, currentRetention);
      setMessages(msgs);
    } catch (e) {
      console.error('Error loading chat data:', e);
    }
  }, [session, retentionHours]);

  useEffect(() => {
    if (session) {
      loadChatData();
    }
  }, [session, loadChatData]);

  // 3. Periodic message retention filter (runs every 10 seconds to purge expired read messages)
  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      setMessages(prev => {
        const filtered = filterExpiredMessages(prev);
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [session]);

  // 4. Initialize WebRTC Manager
  useEffect(() => {
    rtcManagerRef.current = new WebRTCManager({
      onRemoteStream: stream => {
        setRemoteStream(stream);
      },
      onCallStateChange: state => {
        setCallState(state);
        if (state === 'ended' || state === 'rejected') {
          setTimeout(() => {
            setCallModalOpen(false);
            setCallState('idle');
            setLocalStream(null);
            setRemoteStream(null);
            setCallError('');
          }, 1500);
        }
      },
      onError: errMsg => {
        setCallError(errMsg);
      },
    });

    return () => {
      rtcManagerRef.current?.cleanup();
    };
  }, []);

  // Update WebRTC context whenever session or otherParticipant changes
  useEffect(() => {
    if (rtcManagerRef.current && session && otherParticipant) {
      rtcManagerRef.current.initContext(session.roomId, session.participantId, otherParticipant.id);
    }
  }, [session, otherParticipant]);

  // 5. Realtime subscription (Supabase Realtime + fallback BroadcastChannel)
  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToRealtime(
      session.roomId,
      () => {
        // On message update or db change
        loadChatData();
      },
      (signal: WebRTCSignalData) => {
        if (!session || signal.toId !== session.participantId) return;

        if (signal.type === 'call-request') {
          setCallType(signal.callType || 'video');
          setCallState('incoming');
          setCallModalOpen(true);
        } else if (signal.type === 'offer') {
          incomingOfferRef.current = signal.sdp;
        }

        rtcManagerRef.current?.handleIncomingSignal(signal);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [session, loadChatData]);

  // WebRTC Call Initiation Handlers
  const handleStartCall = async (type: CallType) => {
    if (!session || !otherParticipant) {
      alert('Invited participant credentials must be created before starting a call.');
      setIsSettingsOpen(true);
      return;
    }

    setCallType(type);
    setCallError('');
    setCallModalOpen(true);

    try {
      if (rtcManagerRef.current) {
        rtcManagerRef.current.initContext(session.roomId, session.participantId, otherParticipant.id);
        const stream = await rtcManagerRef.current.startCall(type);
        setLocalStream(stream);
      }
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleAcceptCall = async () => {
    try {
      if (rtcManagerRef.current) {
        const stream = await rtcManagerRef.current.acceptIncomingCall(
          callType,
          incomingOfferRef.current
        );
        setLocalStream(stream);
      }
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleRejectCall = () => {
    rtcManagerRef.current?.rejectCall();
    setCallModalOpen(false);
    setCallState('idle');
  };

  const handleEndCall = () => {
    rtcManagerRef.current?.endCall(true);
    setCallModalOpen(false);
    setCallState('idle');
    setLocalStream(null);
    setRemoteStream(null);
  };

  // Messaging Handlers
  const handleSendTextMessage = async (text: string) => {
    if (!session) return;
    const recipientId = otherParticipant ? otherParticipant.id : 'invited_pending';

    const newMsg = await sendMessage({
      roomId: session.roomId,
      senderId: session.participantId,
      senderRole: session.role,
      recipientId,
      content: text,
      messageType: 'text',
    });

    setMessages(prev => [...prev, newMsg]);
  };

  const handleSendImageMessage = async (file: File) => {
    if (!session) return;
    const recipientId = otherParticipant ? otherParticipant.id : 'invited_pending';

    const uploaded = await uploadMedia(file, 'image');
    const newMsg = await sendMessage({
      roomId: session.roomId,
      senderId: session.participantId,
      senderRole: session.role,
      recipientId,
      content: `Shared an image: ${file.name}`,
      messageType: 'image',
      attachmentUrl: uploaded.url,
      attachmentMeta: uploaded.meta,
    });

    setMessages(prev => [...prev, newMsg]);
  };

  const handleSendVoiceMessage = async (audioBlob: Blob, duration: number) => {
    if (!session) return;
    const recipientId = otherParticipant ? otherParticipant.id : 'invited_pending';

    const uploaded = await uploadMedia(audioBlob, 'audio');
    uploaded.meta.duration = duration;

    const newMsg = await sendMessage({
      roomId: session.roomId,
      senderId: session.participantId,
      senderRole: session.role,
      recipientId,
      content: `Voice message (${Math.round(duration)}s)`,
      messageType: 'audio',
      attachmentUrl: uploaded.url,
      attachmentMeta: uploaded.meta,
    });

    setMessages(prev => [...prev, newMsg]);
  };

  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleClearConversation = async () => {
    if (!session) return;
    await clearConversation(session.roomId);
    setMessages([]);
  };

  const handleLogout = () => {
    logout();
    setSession(null);
    checkInitialState();
  };

  // If room is uninitialized or user is not logged in: Show Auth Screen
  if (isInitialized === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          isInitialized={isInitialized}
          onAuthenticated={userSession => {
            setSession(userSession);
            setIsInitialized(true);
            checkInitialState();
          }}
          onOpenSetupGuide={() => setIsSettingsOpen(true)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          session={{
            participantId: '',
            roomId: room?.id || '',
            role: 'owner',
            username: 'admin',
            token: '',
            loginTime: '',
          }}
          currentRetentionHours={retentionHours}
          onClose={() => setIsSettingsOpen(false)}
          onRetentionUpdated={hrs => setRetentionHours(hrs)}
          onConversationCleared={() => {}}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Centered Desktop Layout / Full-Screen Mobile Layout */}
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col sm:my-3 sm:border sm:border-neutral-800/80 sm:rounded-2xl sm:shadow-2xl overflow-hidden bg-neutral-900/60 backdrop-blur-md">
        {/* Chat Header */}
        <ChatHeader
          session={session}
          otherParticipant={otherParticipant}
          retentionHours={retentionHours}
          isPeerOnline={isPeerOnline}
          onStartAudioCall={() => handleStartCall('audio')}
          onStartVideoCall={() => handleStartCall('video')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogout={handleLogout}
        />

        {/* Message Stream */}
        <MessageList
          messages={messages}
          session={session}
          retentionHours={retentionHours}
          onDeleteMessage={handleDeleteMessage}
          onOpenImageModal={(url, id) => {
            setActiveImageUrl(url);
            setActiveImageMessageId(id);
          }}
        />

        {/* Message Input Box */}
        <MessageInput
          onSendTextMessage={handleSendTextMessage}
          onSendImageMessage={handleSendImageMessage}
          onSendVoiceMessage={handleSendVoiceMessage}
        />
      </div>

      {/* WebRTC Video & Audio Call Modal */}
      <CallModal
        isOpen={callModalOpen}
        callState={callState}
        callType={callType}
        peerName={otherParticipant?.username || 'Peer'}
        localStream={localStream}
        remoteStream={remoteStream}
        errorMessage={callError}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onEndCall={handleEndCall}
        onToggleMute={() => rtcManagerRef.current?.toggleMute() ?? false}
        onToggleVideo={() => rtcManagerRef.current?.toggleVideo() ?? false}
        onSwitchCamera={() => rtcManagerRef.current?.switchCamera()}
      />

      {/* Image Lightbox Modal */}
      <ImageModal
        isOpen={Boolean(activeImageUrl)}
        imageUrl={activeImageUrl}
        onClose={() => {
          setActiveImageUrl(null);
          setActiveImageMessageId(null);
        }}
        onDelete={
          activeImageMessageId
            ? () => {
                handleDeleteMessage(activeImageMessageId);
                setActiveImageUrl(null);
                setActiveImageMessageId(null);
              }
            : undefined
        }
      />

      {/* Settings & Deployment Guide Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        session={session}
        currentRetentionHours={retentionHours}
        onClose={() => setIsSettingsOpen(false)}
        onRetentionUpdated={hrs => setRetentionHours(hrs)}
        onConversationCleared={handleClearConversation}
        onSwitchUser={async targetUsername => {
          setIsSettingsOpen(false);
          // Auto log in as the target user in the sandbox
          if (targetUsername === 'owner') {
            const { room: r } = await isRoomInitialized();
            if (r) {
              setSession({
                participantId: 'owner_id',
                roomId: r.id,
                role: 'owner',
                username: 'alice',
                token: 'tok_owner',
                loginTime: new Date().toISOString(),
              });
            }
          } else {
            const invitedP = await getOtherParticipant(session.roomId, session.participantId);
            if (invitedP) {
              setSession({
                participantId: invitedP.id,
                roomId: invitedP.roomId,
                role: 'invited',
                username: invitedP.username,
                token: 'tok_invited',
                loginTime: new Date().toISOString(),
              });
            }
          }
        }}
      />
    </div>
  );
}
