import { CallType, WebRTCSignalData } from '../types';
import { getStoredConfig } from './supabaseClient';
import { sendSignal } from './store';

export interface RTCManagerCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onCallStateChange: (state: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected') => void;
  onError: (errorMsg: string) => void;
}

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCallType: CallType = 'video';
  private roomId: string = '';
  private currentUserId: string = '';
  private targetUserId: string = '';
  private callbacks: RTCManagerCallbacks;
  private audioContext: AudioContext | null = null;
  private ringOscillator: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: number | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';

  constructor(callbacks: RTCManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public initContext(roomId: string, currentUserId: string, targetUserId: string) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.targetUserId = targetUserId;
  }

  private getIceServers(): RTCIceServer[] {
    const config = getStoredConfig();
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    if (config.turnUrl && config.turnUrl.trim()) {
      const turnEntry: RTCIceServer = {
        urls: config.turnUrl.trim(),
      };
      if (config.turnUsername) turnEntry.username = config.turnUsername.trim();
      if (config.turnCredential) turnEntry.credential = config.turnCredential.trim();
      iceServers.push(turnEntry);
    }

    return iceServers;
  }

  // Ringtone synthesizer using native Web Audio API
  public playRingtone(isOutgoing: boolean) {
    this.stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      const freq1 = isOutgoing ? 440 : 480;
      const freq2 = isOutgoing ? 480 : 520;

      const playBeep = () => {
        if (!this.audioContext) return;
        const now = this.audioContext.currentTime;
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc1.frequency.setValueAtTime(freq1, now);
        osc2.frequency.setValueAtTime(freq2, now);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isOutgoing ? 1.5 : 1.0));

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioContext.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + (isOutgoing ? 1.5 : 1.0));
        osc2.stop(now + (isOutgoing ? 1.5 : 1.0));
      };

      playBeep();
      this.ringInterval = window.setInterval(playBeep, isOutgoing ? 3000 : 2500);
    } catch (e) {
      console.warn('Audio tone synthesis error:', e);
    }
  }

  public stopRingtone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = event => {
      if (event.candidate && this.targetUserId) {
        sendSignal(
          {
            type: 'candidate',
            fromId: this.currentUserId,
            toId: this.targetUserId,
            candidate: event.candidate.toJSON(),
            timestamp: Date.now(),
          },
          this.roomId
        );
      }
    };

    pc.ontrack = event => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.callbacks.onRemoteStream(this.remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          this.stopRingtone();
          this.callbacks.onCallStateChange('connected');
          break;
        case 'disconnected':
        case 'failed':
          this.callbacks.onError('WebRTC peer connection lost or failed. Check STUN/TURN network access.');
          this.endCall(false);
          break;
        case 'closed':
          this.callbacks.onCallStateChange('ended');
          break;
      }
    };

    return pc;
  }

  public async startCall(callType: CallType): Promise<MediaStream> {
    this.currentCallType = callType;
    this.callbacks.onCallStateChange('calling');
    this.playRingtone(true);

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: callType === 'video' ? { facingMode: this.currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      this.pc = this.createPeerConnection();

      // Add local tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });

      // Send initial call invitation
      await sendSignal(
        {
          type: 'call-request',
          callType,
          fromId: this.currentUserId,
          toId: this.targetUserId,
          timestamp: Date.now(),
        },
        this.roomId
      );

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      await sendSignal(
        {
          type: 'offer',
          callType,
          fromId: this.currentUserId,
          toId: this.targetUserId,
          sdp: offer,
          timestamp: Date.now(),
        },
        this.roomId
      );

      return this.localStream;
    } catch (err: unknown) {
      this.stopRingtone();
      this.callbacks.onCallStateChange('idle');
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Could not start ${callType} call: ${msg}. Please grant browser media permissions.`);
      throw err;
    }
  }

  public async acceptIncomingCall(callType: CallType, offerSdp?: RTCSessionDescriptionInit): Promise<MediaStream> {
    this.stopRingtone();
    this.currentCallType = callType;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: callType === 'video' ? { facingMode: this.currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      this.pc = this.createPeerConnection();

      this.localStream.getTracks().forEach(track => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });

      if (offerSdp) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        await sendSignal(
          {
            type: 'answer',
            callType,
            fromId: this.currentUserId,
            toId: this.targetUserId,
            sdp: answer,
            timestamp: Date.now(),
          },
          this.roomId
        );
      }

      this.callbacks.onCallStateChange('connected');
      return this.localStream;
    } catch (err: unknown) {
      this.callbacks.onCallStateChange('idle');
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Failed to accept call: ${msg}`);
      throw err;
    }
  }

  public async handleIncomingSignal(signal: WebRTCSignalData): Promise<void> {
    // Only handle signals meant for current participant
    if (signal.toId !== this.currentUserId) return;

    switch (signal.type) {
      case 'call-request':
        this.currentCallType = signal.callType || 'video';
        this.playRingtone(false);
        this.callbacks.onCallStateChange('incoming');
        break;

      case 'offer':
        if (this.pc) {
          if (signal.sdp) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            await sendSignal(
              {
                type: 'answer',
                callType: this.currentCallType,
                fromId: this.currentUserId,
                toId: this.targetUserId,
                sdp: answer,
                timestamp: Date.now(),
              },
              this.roomId
            );
          }
        }
        break;

      case 'answer':
        if (this.pc && signal.sdp) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
        break;

      case 'candidate':
        if (this.pc && signal.candidate) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('Error adding ICE candidate:', e);
          }
        }
        break;

      case 'call-reject':
        this.stopRingtone();
        this.callbacks.onCallStateChange('rejected');
        this.cleanup();
        break;

      case 'call-end':
        this.stopRingtone();
        this.callbacks.onCallStateChange('ended');
        this.cleanup();
        break;
    }
  }

  public rejectCall(): void {
    this.stopRingtone();
    sendSignal(
      {
        type: 'call-reject',
        fromId: this.currentUserId,
        toId: this.targetUserId,
        timestamp: Date.now(),
      },
      this.roomId
    );
    this.callbacks.onCallStateChange('idle');
    this.cleanup();
  }

  public endCall(sendEndSignal = true): void {
    this.stopRingtone();
    if (sendEndSignal && this.targetUserId) {
      sendSignal(
        {
          type: 'call-end',
          fromId: this.currentUserId,
          toId: this.targetUserId,
          timestamp: Date.now(),
        },
        this.roomId
      );
    }
    this.callbacks.onCallStateChange('idle');
    this.cleanup();
  }

  public toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns isMuted
    }
    return false;
  }

  public toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns isVideoOff
    }
    return false;
  }

  public async switchCamera(): Promise<void> {
    if (!this.localStream) return;
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (!currentVideoTrack) return;

    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (this.pc) {
        const sender = this.pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }

      this.localStream.removeTrack(currentVideoTrack);
      currentVideoTrack.stop();
      this.localStream.addTrack(newVideoTrack);
    } catch (err) {
      console.warn('Switch camera not supported or failed:', err);
    }
  }

  public cleanup(): void {
    this.stopRingtone();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(t => t.stop());
      this.remoteStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
