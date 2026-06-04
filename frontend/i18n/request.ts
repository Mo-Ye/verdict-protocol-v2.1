import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'ru', 'sr'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get('locale')?.value ?? '';
  const locale: SupportedLocale = isSupportedLocale(raw) ? raw : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
