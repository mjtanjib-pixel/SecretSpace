export type ParticipantRole = 'owner' | 'invited';

export type MessageType = 'text' | 'image' | 'audio';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Participant {
  id: string;
  roomId: string;
  role: ParticipantRole;
  username: string;
  passwordHash: string;
  salt: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  retentionHours: number; // 1, 24, 168 (7d), 720 (30d)
  maxUnreadDays: number;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentMeta {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number; // for audio voice messages in seconds
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderRole: ParticipantRole;
  recipientId: string;
  content: string;
  messageType: MessageType;
  attachmentUrl?: string;
  attachmentMeta?: AttachmentMeta;
  status: MessageStatus;
  createdAt: string;
  readAt?: string | null;
  expiresAt?: string | null;
}

export type CallType = 'audio' | 'video';

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected' | 'busy';

export interface WebRTCSignalData {
  type: 'offer' | 'answer' | 'candidate' | 'call-request' | 'call-reject' | 'call-end' | 'call-busy';
  callType?: CallType;
  fromId: string;
  toId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  timestamp: number;
}

export interface UserSession {
  participantId: string;
  roomId: string;
  role: ParticipantRole;
  username: string;
  token: string;
  loginTime: string;
}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}
