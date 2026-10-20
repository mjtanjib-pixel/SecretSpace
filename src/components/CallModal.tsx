import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, RefreshCw, User, Shield, AlertTriangle } from 'lucide-react';
import { CallType } from '../types';

interface CallModalProps {
  isOpen: boolean;
  callState: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected';
  callType: CallType;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  errorMessage?: string;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => boolean;
  onToggleVideo: () => boolean;
  onSwitchCamera: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  callState,
  callType,
  peerName,
  localStream,
  remoteStream,
  errorMessage,
  onAccept,
  onReject,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  onSwitchCamera,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Call duration counter
  useEffect(() => {
    let timer: number | null = null;
    if (callState === 'connected') {
      setDuration(0);
      timer = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Bind local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  // Bind remote stream
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callState]);

  if (!isOpen || callState === 'idle') return null;

  const handleMuteClick = () => {
    const muted = onToggleMute();
    setIsMuted(muted);
  };

  const handleVideoClick = () => {
    const videoOff = onToggleVideo();
    setIsVideoOff(videoOff);
  };

  const formatDuration = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-lg flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200">
      {/* Remote audio playback element */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Header: Peer Info & Call Duration / Status */}
      <div className="flex items-center justify-between text-neutral-200 z-10 max-w-4xl mx-auto w-full pt-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-base text-white">{peerName}</h2>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="capitalize">{callType} Call (Encrypted P2P)</span>
              {callState === 'connected' && (
                <>
                  <span>&bull;</span>
                  <span className="font-mono text-emerald-400 font-semibold">{formatDuration(duration)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          {callState === 'calling' && (
            <span className="px-3 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
              Ringing...
            </span>
          )}
          {callState === 'incoming' && (
            <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse">
              Incoming {callType} call
            </span>
          )}
          {callState === 'connected' && (
            <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Error message / Warning banner if ICE/TURN fails */}
      {errorMessage && (
        <div className="max-w-md mx-auto my-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 z-10">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Center Call Canvas */}
      <div className="flex-1 my-4 flex items-center justify-center relative max-w-4xl mx-auto w-full overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl">
        {/* Incoming Call Screen */}
        {callState === 'incoming' && (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-2xl animate-pulse">
                <User className="w-12 h-12" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-emerald-400/40 animate-ping" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">{peerName}</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Incoming {callType} call via SecretSpace WebRTC
              </p>
            </div>

            <div className="flex items-center gap-8 pt-4">
              <button
                onClick={onReject}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-rose-950/60"
                title="Decline"
              >
                <PhoneOff className="w-6 h-6" />
              </button>

              <button
                onClick={onAccept}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-emerald-950/60 animate-bounce"
                title="Accept"
              >
                {callType === 'video' ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
              </button>
            </div>
          </div>
        )}

        {/* Outgoing Ringing Screen */}
        {callState === 'calling' && (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700 flex items-center justify-center text-emerald-400 shadow-xl">
                <User className="w-12 h-12" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-pulse" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">{peerName}</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Calling... waiting for participant to answer
              </p>
            </div>

            {/* Local video preview if video call */}
            {callType === 'video' && (
              <div className="w-48 h-32 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              </div>
            )}
          </div>
        )}

        {/* Connected Audio Call Screen */}
        {callState === 'connected' && callType === 'audio' && (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 flex items-center justify-center text-white shadow-2xl">
                <User className="w-14 h-14" />
              </div>
              <div className="absolute -inset-2 rounded-full border-2 border-emerald-400/40 animate-pulse" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">{peerName}</h3>
              <p className="text-xs text-emerald-400 font-mono mt-1">
                Audio Call Active &bull; {formatDuration(duration)}
              </p>
            </div>
          </div>
        )}

        {/* Connected Video Call Screen */}
        {callState === 'connected' && callType === 'video' && (
          <div className="w-full h-full relative bg-neutral-950 flex items-center justify-center">
            {/* Remote Peer Video Stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* If remote video stream hasn't produced tracks yet */}
            {(!remoteStream || remoteStream.getVideoTracks().length === 0) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/80 text-neutral-400">
                <User className="w-16 h-16 text-neutral-600 mb-2" />
                <p className="text-sm font-medium">Connecting video feed...</p>
              </div>
            )}

            {/* Floating Picture-in-Picture Local Video Preview */}
            <div className="absolute bottom-4 right-4 w-32 sm:w-48 h-24 sm:h-36 rounded-xl overflow-hidden border-2 border-neutral-800 bg-neutral-900 shadow-2xl z-20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center text-neutral-400 text-xs">
                  Camera off
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center gap-4 max-w-md mx-auto w-full pb-2 z-10">
        {/* Mute Toggle */}
        <button
          onClick={handleMuteClick}
          className={`p-3.5 rounded-full transition-all cursor-pointer ${
            isMuted
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Camera Toggle (for video calls) */}
        {callType === 'video' && (
          <>
            <button
              onClick={handleVideoClick}
              className={`p-3.5 rounded-full transition-all cursor-pointer ${
                isVideoOff
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              }`}
              title={isVideoOff ? 'Turn video on' : 'Turn video off'}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {/* Camera Switch (front/back on mobile) */}
            <button
              onClick={onSwitchCamera}
              className="p-3.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all cursor-pointer"
              title="Switch camera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </>
        )}

        {/* End / Hang Up Call */}
        <button
          onClick={onEndCall}
          className="p-3.5 px-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/60"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">End</span>
        </button>
      </div>
    </div>
  );
};
