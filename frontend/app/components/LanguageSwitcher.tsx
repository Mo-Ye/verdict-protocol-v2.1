'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LOCALES, LOCALE_FLAGS, type Locale } from '../lib/constants';

export default function LanguageSwitcher() {
  const t = useTranslations('language');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Locale>('en');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const match = document.cookie.match(/locale=(\w+)/);
    if (match && LOCALES.includes(match[1] as Locale)) {
      setCurrent(match[1] as Locale);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchLocale = (locale: Locale) => {
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    setCurrent(locale);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
      >
        <span>{LOCALE_FLAGS[current]}</span>
        <span className="hidden sm:inline">{t(current)}</span>
        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[#1a1b2e] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 min-w-[160px]">
          {LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => switchLocale(locale)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                locale === current ? 'bg-white/5 text-white' : 'text-gray-300'
              }`}
            >
              <span>{LOCALE_FLAGS[locale]}</span>
              <span>{t(locale)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
