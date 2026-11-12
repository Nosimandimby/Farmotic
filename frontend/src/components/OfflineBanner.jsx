import { WifiOff } from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus.js';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-900"
    >
      <WifiOff size={16} className="shrink-0" />
      <span>⚠️ Mode hors-ligne — consultation uniquement</span>
    </div>
  );
}
