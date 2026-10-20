import {
  Message,
  Participant,
  ParticipantRole,
  Room,
  UserSession,
  WebRTCSignalData,
  AttachmentMeta,
} from '../types';
import { generateSalt, hashPassword, verifyPassword, generateSecureToken } from './crypto';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

const LOCAL_STORAGE_KEY_PREFIX = 'secretspace_local_';
const BROADCAST_CHANNEL_NAME = 'secretspace_bus';

// In-memory / localStorage fallback storage when Supabase is not yet connected
interface LocalDB {
  room: Room | null;
  participants: Participant[];
  messages: Message[];
}

function getLocalDB(): LocalDB {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}db`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read local DB', e);
  }
  return {
    room: null,
    participants: [],
    messages: [],
  };
}

function saveLocalDB(db: LocalDB): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}db`, JSON.stringify(db));
    // Broadcast change to other tabs
    getBroadcastChannel().postMessage({ type: 'db_update', timestamp: Date.now() });
  } catch (e) {
    console.error('Failed to save local DB', e);
  }
}

let broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel {
  if (!broadcastChannel && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
  return broadcastChannel as BroadcastChannel;
}

// --------------------------------------------------------------------------
// Session Management
// --------------------------------------------------------------------------
const SESSION_KEY = 'secretspace_active_session';

export function getActiveSession(): UserSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading active session', e);
  }
  return null;
}

export function setActiveSession(session: UserSession | null): void {
  if (session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

// --------------------------------------------------------------------------
// Room & Setup Operations
// --------------------------------------------------------------------------

export async function isRoomInitialized(): Promise<{ initialized: boolean; room: Room | null }> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: rooms, error } = await supabase
        .from('secretspace_rooms')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1);

      if (error) {
        console.warn('Supabase rooms check error, falling back to local store:', error.message);
      } else if (rooms && rooms.length > 0) {
        const r = rooms[0];
        const room: Room = {
          id: r.id,
          name: r.name,
          retentionHours: r.retention_hours,
          maxUnreadDays: r.max_unread_days,
          isLocked: r.is_locked,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
        // Check if owner participant exists
        const { data: owners } = await supabase
          .from('secretspace_participants')
          .select('id')
          .eq('room_id', room.id)
          .eq('role', 'owner')
          .limit(1);

        return { initialized: Boolean(owners && owners.length > 0), room };
      }
    } catch (err) {
      console.warn('Error querying Supabase room, using fallback:', err);
    }
  }

  // Fallback engine
  const db = getLocalDB();
  const hasOwner = db.participants.some(p => p.role === 'owner' && p.isActive);
  return { initialized: hasOwner && db.room !== null, room: db.room };
}

export async function initializeOwner(username: string, password: string): Promise<UserSession> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const roomId = generateSecureToken();
  const participantId = generateSecureToken();
  const now = new Date().toISOString();

  const room: Room = {
    id: roomId,
    name: 'SecretSpace Private Room',
    retentionHours: 24, // default 24h retention
    maxUnreadDays: 30,
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  };

  const owner: Participant = {
    id: participantId,
    roomId,
    role: 'owner',
    username: username.trim(),
    passwordHash,
    salt,
    isActive: true,
    lastSeenAt: now,
    createdAt: now,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      // Insert room
      await supabase.from('secretspace_rooms').insert([
        {
          id: room.id,
          name: room.name,
          retention_hours: room.retentionHours,
          max_unread_days: room.maxUnreadDays,
          is_locked: room.isLocked,
          created_at: room.createdAt,
          updated_at: room.updatedAt,
        },
      ]);

      // Insert owner participant
      await supabase.from('secretspace_participants').insert([
        {
          id: owner.id,
          room_id: owner.roomId,
          role: owner.role,
          username: owner.username,
          password_hash: owner.passwordHash,
          salt: owner.salt,
          is_active: owner.isActive,
          last_seen_at: owner.lastSeenAt,
          created_at: owner.createdAt,
        },
      ]);
    } catch (err) {
      console.warn('Supabase initialization write failed, using local mirror:', err);
    }
  }

  // Always mirror in local store for resilience
  const db = getLocalDB();
  db.room = room;
  db.participants = [owner];
  saveLocalDB(db);

  const session: UserSession = {
    participantId: owner.id,
    roomId: room.id,
    role: 'owner',
    username: owner.username,
    token: generateSecureToken(),
    loginTime: now,
  };

  setActiveSession(session);
  return session;
}

// --------------------------------------------------------------------------
// Authentication
// --------------------------------------------------------------------------

export async function login(username: string, password: string): Promise<UserSession> {
  const cleanUsername = username.trim();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data: participants, error } = await supabase
        .from('secretspace_participants')
        .select('*')
        .eq('is_active', true);

      if (!error && participants && participants.length > 0) {
        for (const p of participants) {
          if (p.username.toLowerCase() === cleanUsername.toLowerCase()) {
            const matches = await verifyPassword(password, p.salt, p.password_hash);
            if (matches) {
              const now = new Date().toISOString();
              // Update last seen
              await supabase
                .from('secretspace_participants')
                .update({ last_seen_at: now })
                .eq('id', p.id);

              const session: UserSession = {
                participantId: p.id,
                roomId: p.room_id,
                role: p.role as ParticipantRole,
                username: p.username,
                token: generateSecureToken(),
                loginTime: now,
              };
              setActiveSession(session);
              return session;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Supabase login check failed, falling back to local DB:', e);
    }
  }

  // Fallback local DB
  const db = getLocalDB();
  const found = db.participants.find(
    p => p.username.toLowerCase() === cleanUsername.toLowerCase() && p.isActive
  );

  if (!found) {
    throw new Error('Invalid participant credentials or access has been revoked.');
  }

  const isValid = await verifyPassword(password, found.salt, found.passwordHash);
  if (!isValid) {
    throw new Error('Invalid participant credentials.');
  }

  found.lastSeenAt = new Date().toISOString();
  saveLocalDB(db);

  const session: UserSession = {
    participantId: found.id,
    roomId: found.roomId,
    role: found.role,
    username: found.username,
    token: generateSecureToken(),
    loginTime: found.lastSeenAt,
  };

  setActiveSession(session);
  return session;
}

export function logout(): void {
  setActiveSession(null);
}

// --------------------------------------------------------------------------
// Participant Management (Owner Only)
// --------------------------------------------------------------------------

export async function getInvitedParticipant(roomId: string): Promise<Participant | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('secretspace_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('role', 'invited')
        .limit(1);

      if (!error && data && data.length > 0) {
        const item = data[0];
        return {
          id: item.id,
          roomId: item.room_id,
          role: item.role,
          username: item.username,
          passwordHash: item.password_hash,
          salt: item.salt,
          isActive: item.is_active,
          lastSeenAt: item.last_seen_at,
          createdAt: item.created_at,
        };
      }
    } catch (e) {
      console.warn('Failed to get invited participant from Supabase', e);
    }
  }

  const db = getLocalDB();
  return db.participants.find(p => p.role === 'invited') || null;
}

export async function upsertInvitedParticipant(
  roomId: string,
  username: string,
  password: string
): Promise<Participant> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  let invited = await getInvitedParticipant(roomId);

  if (!invited) {
    invited = {
      id: generateSecureToken(),
      roomId,
      role: 'invited',
      username: username.trim(),
      passwordHash,
      salt,
      isActive: true,
      lastSeenAt: null,
      createdAt: now,
    };
  } else {
    invited.username = username.trim();
    invited.passwordHash = passwordHash;
    invited.salt = salt;
    invited.isActive = true;
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      const payload = {
        id: invited.id,
        room_id: invited.roomId,
        role: invited.role,
        username: invited.username,
        password_hash: invited.passwordHash,
        salt: invited.salt,
        is_active: invited.isActive,
        last_seen_at: invited.lastSeenAt,
        created_at: invited.createdAt,
      };

      await supabase
        .from('secretspace_participants')
        .upsert(payload, { onConflict: 'room_id,role' });
    } catch (e) {
      console.warn('Error saving invited participant to Supabase:', e);
    }
  }

  // Update local DB
  const db = getLocalDB();
  const idx = db.participants.findIndex(p => p.role === 'invited');
  if (idx >= 0) {
    db.participants[idx] = invited;
  } else {
    db.participants.push(invited);
  }
  saveLocalDB(db);

  return invited;
}

export async function revokeInvitedParticipant(roomId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('secretspace_participants')
        .update({ is_active: false })
        .eq('room_id', roomId)
        .eq('role', 'invited');
    } catch (e) {
      console.warn('Error revoking invited participant in Supabase:', e);
    }
  }

  const db = getLocalDB();
  const p = db.participants.find(x => x.role === 'invited');
  if (p) {
    p.isActive = false;
    saveLocalDB(db);
  }
}

export async function changeParticipantPassword(
  participantId: string,
  newPassword: string
): Promise<void> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(newPassword, salt);

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('secretspace_participants')
        .update({
          password_hash: passwordHash,
          salt: salt,
        })
        .eq('id', participantId);
    } catch (e) {
      console.warn('Error changing password in Supabase:', e);
    }
  }

  const db = getLocalDB();
  const p = db.participants.find(x => x.id === participantId);
  if (p) {
    p.passwordHash = passwordHash;
    p.salt = salt;
    saveLocalDB(db);
  }
}

// --------------------------------------------------------------------------
// Room Settings & Retention
// --------------------------------------------------------------------------

export async function getRoom(roomId: string): Promise<Room | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('secretspace_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          retentionHours: data.retention_hours,
          maxUnreadDays: data.max_unread_days,
          isLocked: data.is_locked,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (e) {
      console.warn('Failed to get room from Supabase:', e);
    }
  }

  const db = getLocalDB();
  return db.room;
}

export async function updateRetentionHours(roomId: string, hours: number): Promise<void> {
  const now = new Date().toISOString();
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('secretspace_rooms')
        .update({ retention_hours: hours, updated_at: now })
        .eq('id', roomId);
    } catch (e) {
      console.warn('Failed to update retention hours in Supabase:', e);
    }
  }

  const db = getLocalDB();
  if (db.room) {
    db.room.retentionHours = hours;
    db.room.updatedAt = now;
    saveLocalDB(db);
  }
}

// --------------------------------------------------------------------------
// Messaging & Retention Execution
// --------------------------------------------------------------------------

// Cleans up any message whose expires_at is past
export function filterExpiredMessages(messages: Message[]): Message[] {
  const now = Date.now();
  return messages.filter(m => {
    if (!m.expiresAt) return true;
    const expiry = new Date(m.expiresAt).getTime();
    return expiry > now;
  });
}

export async function fetchMessages(
  roomId: string,
  currentUserId: string,
  retentionHours = 24
): Promise<Message[]> {
  const supabase = getSupabase();
  let rawMessages: Message[] = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('secretspace_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        rawMessages = data.map(item => ({
          id: item.id,
          roomId: item.room_id,
          senderId: item.sender_id,
          senderRole: item.sender_role || 'owner',
          recipientId: item.recipient_id,
          content: item.content,
          messageType: item.message_type,
          attachmentUrl: item.attachment_url,
          attachmentMeta: item.attachment_meta,
          status: item.status,
          createdAt: item.created_at,
          readAt: item.read_at,
          expiresAt: item.expires_at,
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch messages from Supabase, falling back to local DB:', e);
    }
  }

  if (rawMessages.length === 0) {
    const db = getLocalDB();
    rawMessages = db.messages.filter(m => m.roomId === roomId);
  }

  // 1. Filter out expired messages
  const validMessages = filterExpiredMessages(rawMessages);

  // 2. Mark any unread incoming messages as read and set expiration timer
  const now = new Date();
  const unreadIncoming = validMessages.filter(
    m => m.recipientId === currentUserId && m.status !== 'read'
  );

  if (unreadIncoming.length > 0) {
    const readTimestamp = now.toISOString();
    const expiresTimestamp = new Date(now.getTime() + retentionHours * 3600 * 1000).toISOString();

    for (const msg of unreadIncoming) {
      msg.status = 'read';
      msg.readAt = readTimestamp;
      msg.expiresAt = expiresTimestamp;

      // Update in Supabase
      if (supabase) {
        supabase
          .from('secretspace_messages')
          .update({
            status: 'read',
            read_at: readTimestamp,
            expires_at: expiresTimestamp,
          })
          .eq('id', msg.id)
          .then();
      }
    }

    // Mirror to local DB
    const db = getLocalDB();
    db.messages = validMessages;
    saveLocalDB(db);
  }

  return validMessages;
}

export async function sendMessage(
  msg: Omit<Message, 'id' | 'createdAt' | 'status' | 'readAt' | 'expiresAt'>
): Promise<Message> {
  const id = generateSecureToken();
  const now = new Date().toISOString();

  const newMessage: Message = {
    ...msg,
    id,
    status: 'sent',
    createdAt: now,
    readAt: null,
    expiresAt: null, // Timer begins upon read by recipient
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('secretspace_messages').insert([
        {
          id: newMessage.id,
          room_id: newMessage.roomId,
          sender_id: newMessage.senderId,
          recipient_id: newMessage.recipientId,
          content: newMessage.content,
          message_type: newMessage.messageType,
          attachment_url: newMessage.attachmentUrl,
          attachment_meta: newMessage.attachmentMeta,
          status: newMessage.status,
          created_at: newMessage.createdAt,
          read_at: newMessage.readAt,
          expires_at: newMessage.expiresAt,
        },
      ]);
    } catch (e) {
      console.warn('Failed to insert message to Supabase:', e);
    }
  }

  // Save to local store
  const db = getLocalDB();
  db.messages.push(newMessage);
  saveLocalDB(db);

  return newMessage;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('secretspace_messages').delete().eq('id', messageId);
    } catch (e) {
      console.warn('Failed to delete message in Supabase:', e);
    }
  }

  const db = getLocalDB();
  db.messages = db.messages.filter(m => m.id !== messageId);
  saveLocalDB(db);
}

export async function clearConversation(roomId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('secretspace_messages').delete().eq('room_id', roomId);
    } catch (e) {
      console.warn('Failed to clear conversation in Supabase:', e);
    }
  }

  const db = getLocalDB();
  db.messages = db.messages.filter(m => m.roomId !== roomId);
  saveLocalDB(db);
}

// --------------------------------------------------------------------------
// Media Upload (Image & Audio)
// --------------------------------------------------------------------------

export async function uploadMedia(
  fileOrBlob: File | Blob,
  type: 'image' | 'audio',
  fileName?: string
): Promise<{ url: string; meta: AttachmentMeta }> {
  const fileExt = type === 'image' ? 'webp' : 'webm';
  const name = fileName || `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const supabase = getSupabase();

  if (supabase) {
    try {
      const filePath = `${type}s/${name}`;
      const { error: uploadErr } = await supabase.storage
        .from('secretspace-media')
        .upload(filePath, fileOrBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: fileOrBlob.type || (type === 'image' ? 'image/jpeg' : 'audio/webm'),
        });

      if (!uploadErr) {
        // Create signed URL valid for 24 hours (86400 seconds)
        const { data: signedData, error: signErr } = await supabase.storage
          .from('secretspace-media')
          .createSignedUrl(filePath, 86400);

        if (!signErr && signedData?.signedUrl) {
          return {
            url: signedData.signedUrl,
            meta: {
              fileName: name,
              fileSize: fileOrBlob.size,
              mimeType: fileOrBlob.type,
            },
          };
        }
      } else {
        console.warn('Supabase storage upload error:', uploadErr.message);
      }
    } catch (e) {
      console.warn('Supabase media upload failed, using local blob fallback:', e);
    }
  }

  // Fallback: Convert to base64 Data URL or Object URL for immediate preview
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        url: reader.result as string,
        meta: {
          fileName: name,
          fileSize: fileOrBlob.size,
          mimeType: fileOrBlob.type,
        },
      });
    };
    reader.onerror = () => reject(new Error('Failed to read media file'));
    reader.readAsDataURL(fileOrBlob);
  });
}

// --------------------------------------------------------------------------
// Real-time Event Subscription & WebRTC Signaling
// --------------------------------------------------------------------------

export function subscribeToRealtime(
  roomId: string,
  onMessageUpdate: () => void,
  onSignalReceived: (signal: WebRTCSignalData) => void
): () => void {
  const supabase = getSupabase();
  let supabaseChannel: ReturnType<SupabaseClient['channel']> | null = null;

  if (supabase) {
    try {
      supabaseChannel = supabase
        .channel(`room_${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'secretspace_messages', filter: `room_id=eq.${roomId}` },
          () => {
            onMessageUpdate();
          }
        )
        .on('broadcast', { event: 'signal' }, payload => {
          if (payload.payload) {
            onSignalReceived(payload.payload as WebRTCSignalData);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Failed to subscribe to Supabase Realtime channel:', e);
    }
  }

  // Fallback BroadcastChannel for multi-tab synchronization
  const bc = getBroadcastChannel();
  const handleBcMessage = (event: MessageEvent) => {
    if (!event.data) return;
    if (event.data.type === 'db_update') {
      onMessageUpdate();
    } else if (event.data.type === 'signal') {
      onSignalReceived(event.data.signal as WebRTCSignalData);
    }
  };

  if (bc) {
    bc.addEventListener('message', handleBcMessage);
  }

  return () => {
    if (supabaseChannel) {
      supabaseChannel.unsubscribe();
    }
    if (bc) {
      bc.removeEventListener('message', handleBcMessage);
    }
  };
}

export async function sendSignal(signal: WebRTCSignalData, roomId: string): Promise<void> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const channel = supabase.channel(`room_${roomId}`);
      await channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: signal,
      });
    } catch (e) {
      console.warn('Failed to send Supabase signal, broadcast fallback:', e);
    }
  }

  // Cross-tab broadcast fallback
  const bc = getBroadcastChannel();
  if (bc) {
    bc.postMessage({ type: 'signal', signal });
  }
}

export async function getOtherParticipant(
  roomId: string,
  currentUserId: string
): Promise<Participant | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('secretspace_participants')
        .select('*')
        .eq('room_id', roomId)
        .neq('id', currentUserId)
        .eq('is_active', true)
        .limit(1);

      if (data && data.length > 0) {
        const item = data[0];
        return {
          id: item.id,
          roomId: item.room_id,
          role: item.role,
          username: item.username,
          passwordHash: item.password_hash,
          salt: item.salt,
          isActive: item.is_active,
          lastSeenAt: item.last_seen_at,
          createdAt: item.created_at,
        };
      }
    } catch (e) {
      console.warn('Failed to fetch other participant from Supabase', e);
    }
  }

  const db = getLocalDB();
  return db.participants.find(p => p.id !== currentUserId && p.isActive) || null;
}
