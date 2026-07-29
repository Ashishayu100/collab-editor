import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface LinkModalProps {
  initialUrl?: string;
  onApply: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function LinkModal({ initialUrl = '', onApply, onRemove, onClose }: LinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  function handleApply() {
    const trimmed = url.trim();
    if (trimmed) {
      onApply(trimmed);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
    >
      <Input
        autoFocus
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="mt-3 flex justify-end gap-2">
        {initialUrl && (
          <Button type="button" variant="secondary" onClick={onRemove}>
            Remove Link
          </Button>
        )}
        <Button type="button" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
