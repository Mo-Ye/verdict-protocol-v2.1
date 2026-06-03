'use client';

interface StatusBannerProps {
  message: string;
}

export default function StatusBanner({ message }: StatusBannerProps) {
  if (!message) return null;
  return (
    <div className="mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
      {message}
    </div>
  );
}
