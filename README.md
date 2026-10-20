# SecretSpace — Private 2-Person Messaging Web Application

SecretSpace is a temporary, private messaging web application designed for exactly two authorized participants (the **Room Owner** and one **Invited Participant**).

It supports real-time text messaging, photo sharing (JPEG, PNG, WebP), in-browser voice note recording, WebRTC peer-to-peer audio calls, WebRTC video calls, offline message delivery, and configurable automatic message deletion.

---

## 🚀 Key Features

1. **Strict 2-Person Access Control**
   - No public registration or sign-up forms.
   - Initial setup allows the Owner to establish master credentials.
   - The Owner creates, rotates, or revokes access credentials for the single Invited Participant.
   - Passwords are never stored in plaintext — hashed using PBKDF2 with SHA-256 (100,000 iterations) and randomized salts.

2. **Offline-First Delivery & Read Receipts**
   - If Person A sends a message while Person B is offline, the message is stored securely in the database.
   - Person A sees a single tick (**Sent**).
   - Once Person B logs in, the message is delivered and marked (**Read** with double emerald ticks).
   - The message retention countdown begins only when the message is read by the recipient.

3. **Configurable Auto-Deletion**
   - Configurable retention periods: **1 hour**, **24 hours (default)**, **7 days**, **30 days**.
   - Read messages are automatically purged once their timer completes.
   - Deletion removes records from the database and attachments from private storage.
   - Manual controls to delete individual messages or wipe the entire conversation.

4. **Media Sharing & Private Storage**
   - **Photos**: Upload JPEG, PNG, or WebP images with inline preview and full-screen lightbox zoom.
   - **Voice Messages**: Record audio directly in the browser via `MediaRecorder`, preview playback before sending, and listen inline with an interactive scrubber.
   - Stored in a private Supabase Storage bucket (`secretspace-media`) with signed temporary URLs.

5. **WebRTC P2P Audio & Video Calls**
   - Browser-to-browser audio and video calling powered by WebRTC.
   - Web Audio API synthesizer for incoming/outgoing ringtones (zero external media dependencies).
   - Microphone mute/unmute, camera toggle, and mobile front/rear camera flip.
   - Live call duration counter.
   - Default Google STUN server (`stun:stun.l.google.com:19302`) + optional TURN relay configuration.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
- **Backend / Database**: Supabase (PostgreSQL, Row Level Security, Realtime channels, Storage buckets).
- **Audio / Video Calling**: WebRTC with STUN/TURN signaling.
- **Deployment**: Vercel.

---

## 📋 Quick Setup & Deployment Guide

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create an account or sign in.
2. Click **New Project**, choose an organization, give your project a name (e.g. `secretspace-db`), and set a secure database password.

### 2. Run the SQL Migration
1. In your Supabase Dashboard, open the **SQL Editor** from the left navigation.
2. Click **New Query**.
3. Copy the entire contents of `supabase/schema.sql` from this repository (or copy it directly from the **Settings > Supabase** tab inside the app).
4. Click **Run**.
5. This script creates:
   - `secretspace_rooms`
   - `secretspace_participants`
   - `secretspace_messages`
   - `secretspace_signals`
   - Row Level Security (RLS) policies
   - The private storage bucket `secretspace-media`
   - The automated cleanup function `clean_expired_secretspace_messages()`

### 3. Retrieve Supabase API Credentials
1. In your Supabase project, go to **Project Settings** > **API**.
2. Note your **Project URL** (e.g., `https://xyzabcdefg.supabase.co`).
3. Note your **anon / public key**.

### 4. Deploy to Vercel
1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial SecretSpace commit"
   git remote add origin https://github.com/your-username/secretspace.git
   git push -u origin main
   ```
2. Log into [vercel.com](https://vercel.com) and click **Add New > Project**.
3. Import your GitHub repository.
4. Under **Environment Variables**, configure:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase Anon public key
   - *(Optional TURN)* `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`
5. Click **Deploy**.

---

## 🧪 Testing Checklist for Two Participants

1. **Owner Setup**: Open your deployed URL on Device/Browser A. Create the Owner username and master password.
2. **Create Invited Access**: Click the **Settings** gear icon > **Invited Participant** tab. Set a username (e.g., `bob`) and a password (e.g., `secret123`).
3. **Participant Login**: Open the URL in an Incognito window or on Device B. Enter the invited credentials.
4. **Offline Messaging Test**:
   - Close Device B.
   - Send a message from Device A. Notice the single checkmark (**Sent**).
   - Re-open Device B and log in.
   - The message appears on Device B, and Device A updates to double green ticks (**Read**).
   - The expiration timer badge displays the remaining countdown.
5. **Photo & Voice Sharing**:
   - Click the camera icon on Device A to share a photo.
   - Click the microphone icon on Device B to record a voice note, preview it, and send it.
6. **WebRTC Calling**:
   - With both devices open, click **Audio Call** or **Video Call** on Device A.
   - Device B rings with the incoming call dialog.
   - Accept the call to test real-time two-way audio and video.

---

## 🔒 Security & Privacy Notice

- **Transport & Storage**: All communication runs over HTTPS and WebSockets. Passwords are salted and hashed with PBKDF2 (100,000 iterations). Attachments are stored in private buckets accessible only via signed tokens.
- **Automatic Deletion Limitations**: While messages and attachments are automatically purged from the server after the retention period, automatic deletion cannot guarantee protection against the recipient taking screenshots, screen recordings, or photos of the physical screen.
