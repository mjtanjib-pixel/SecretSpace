import React from 'react';
import { X, Download, Trash2 } from 'lucide-react';

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
  onDelete?: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onDelete,
}) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `secretspace_image_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top action controls */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          className="p-2.5 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
          title="Download Image"
        >
          <Download className="w-5 h-5" />
        </button>

        {onDelete && (
          <button
            onClick={() => {
              if (window.confirm('Delete this image message permanently for both participants?')) {
                onDelete();
                onClose();
              }
            }}
            className="p-2.5 rounded-full bg-rose-900/60 hover:bg-rose-800 text-rose-200 transition-colors cursor-pointer"
            title="Delete Image"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
          title="Close Preview"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image container */}
      <div
        className="max-w-4xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-xl border border-neutral-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt="Shared private attachment"
          className="max-w-full max-h-[85vh] object-contain rounded-xl"
        />
      </div>
    </div>
  );
};
