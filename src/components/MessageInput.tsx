import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Mic, Square, Trash2, Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { AudioRecorder, AudioRecorderState } from '../lib/audioRecorder';

interface MessageInputProps {
  onSendTextMessage: (text: string) => Promise<void>;
  onSendImageMessage: (file: File) => Promise<void>;
  onSendVoiceMessage: (audioBlob: Blob, duration: number) => Promise<void>;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendTextMessage,
  onSendImageMessage,
  onSendVoiceMessage,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Audio recording state
  const [recorderState, setRecorderState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null,
  });
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    audioRecorderRef.current = new AudioRecorder(state => {
      setRecorderState(state);
    });

    return () => {
      audioRecorderRef.current?.cancel();
    };
  }, []);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;

    try {
      setIsSending(true);
      setErrorMessage('');
      await onSendTextMessage(trimmed);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto resize
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Image Upload Handlers
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    // Validate mime
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setErrorMessage('Unsupported image format. Please select JPEG, PNG, or WebP.');
      return;
    }

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('Image size exceeds 15MB limit.');
      return;
    }

    try {
      setIsSending(true);
      setErrorMessage('');
      await onSendImageMessage(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to send image: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  // Voice recording handlers
  const startRecording = async () => {
    setErrorMessage('');
    try {
      await audioRecorderRef.current?.start();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const stopRecording = () => {
    audioRecorderRef.current?.stop();
  };

  const cancelRecording = () => {
    audioRecorderRef.current?.cancel();
    setIsPreviewPlaying(false);
  };

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play();
      setIsPreviewPlaying(true);
    }
  };

  const sendVoiceNote = async () => {
    if (!recorderState.audioBlob || isSending) return;
    try {
      setIsSending(true);
      setErrorMessage('');
      await onSendVoiceMessage(recorderState.audioBlob, recorderState.duration || 1);
      cancelRecording();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to send voice note: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 sm:p-4 bg-neutral-900/95 border-t border-neutral-800/80 backdrop-blur-md shrink-0">
      {errorMessage && (
        <div className="mb-2 p-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span className="truncate">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-neutral-400 hover:text-neutral-200 text-xs ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Mode 1: Live Voice Recording in progress */}
      {recorderState.isRecording && (
        <div className="flex items-center justify-between gap-3 bg-neutral-950 border border-red-500/30 rounded-2xl p-2.5 px-4 shadow-inner animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-mono font-medium text-red-400">
              Recording Voice Note: {formatSeconds(recorderState.duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Cancel recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current text-amber-400" />
              <span>Review</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: Voice Recording Preview before sending */}
      {!recorderState.isRecording && recorderState.audioUrl && (
        <div className="flex items-center justify-between gap-3 bg-neutral-950 border border-emerald-500/30 rounded-2xl p-2.5 px-4 shadow-inner">
          <audio
            ref={previewAudioRef}
            src={recorderState.audioUrl}
            onEnded={() => setIsPreviewPlaying(false)}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePreviewPlay}
              className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-colors cursor-pointer shadow-xs"
            >
              {isPreviewPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>
            <span className="text-xs font-mono text-neutral-300">
              Voice Note ({formatSeconds(recorderState.duration)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Discard"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={sendVoiceNote}
              disabled={isSending}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Send Audio</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 3: Standard Text & Attachment Input */}
      {!recorderState.isRecording && !recorderState.audioUrl && (
        <div className="flex items-end gap-2 bg-neutral-950 border border-neutral-800 rounded-2xl p-1.5 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
          {/* Hidden image file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          {/* Photo attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSending}
            title="Share Photo (JPEG, PNG, WebP)"
            className="p-2 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-900 rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Voice recording button */}
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || isSending}
            title="Record Voice Note"
            className="p-2 text-neutral-400 hover:text-rose-400 hover:bg-neutral-900 rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Multi-line expanding text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a private message... (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={disabled || isSending}
            className="flex-1 max-h-[120px] bg-transparent resize-none py-2 px-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none leading-relaxed"
          />

          {/* Send text button */}
          <button
            type="button"
            onClick={handleSendText}
            disabled={!text.trim() || isSending || disabled}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
            title="Send Message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
