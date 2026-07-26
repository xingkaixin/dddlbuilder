import { Languages } from '@/components/icons';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/i18n/LocaleContext';
import { useTranslation } from 'react-i18next';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';

interface LocaleSwitcherProps {
  triggerClassName?: string;
}

export const LocaleSwitcher = memo<LocaleSwitcherProps>(({ triggerClassName }) => {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  const labelMap: Record<AppLocale, string> = {
    'zh-CN': t('locale.zhCN'),
    'en-US': t('locale.enUS'),
  };

  const triggerLabel = t('locale.aria', {
    lang: labelMap[locale],
  });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={triggerLabel}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                triggerClassName,
              )}
            >
              <Languages className="h-4 w-4" aria-hidden />
              <span>{labelMap[locale]}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('header.changeLanguage')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => setLocale(value as AppLocale)}
        >
          <DropdownMenuRadioItem value="zh-CN">{t('locale.zhCN')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">{t('locale.enUS')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

LocaleSwitcher.displayName = 'LocaleSwitcher';
