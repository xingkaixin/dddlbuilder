import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Info, ShieldUser, UserRound, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface AuthPanelProps {
  authInput: string;
  authObjects: string[];
  onAuthInputChange: (value: string) => void;
  onAddAuthObject: (value: string) => void;
  onRemoveAuthObject: (index: number) => void;
}

export const AuthPanel = memo<AuthPanelProps>(
  ({ authInput, authObjects, onAuthInputChange, onAddAuthObject, onRemoveAuthObject }) => {
    const { t } = useTranslation();

    return (
      <div className="relative rounded-lg border bg-card/95 shadow-lg shadow-primary/5">
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

        <div className="relative space-y-6 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
              <ShieldUser className="h-7 w-7" />
            </div>
            <div className="min-w-0 pt-1">
              <h3 className="text-xl font-semibold tracking-normal text-foreground">
                {t('authPanel.title')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('authPanel.description')}</p>
            </div>
          </div>

          <section className="rounded-lg border bg-background/65 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-5 w-1 rounded-full bg-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                {t('authPanel.manualTitle')}
              </h4>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <Input
                placeholder={t('authPanel.inputPlaceholder')}
                value={authInput}
                onChange={(e) => {
                  onAuthInputChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && authInput.trim()) {
                    e.preventDefault();
                    onAddAuthObject(authInput.trim());
                  } else if (e.key === 'Backspace' && authInput === '' && authObjects.length > 0) {
                    e.preventDefault();
                    onRemoveAuthObject(authObjects.length - 1);
                  }
                }}
                className="h-12 flex-1 bg-card text-base transition-all duration-200 focus-visible:ring-primary/30"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-12 min-w-28 rounded-md text-base font-semibold shadow-md shadow-primary/20"
                    disabled={!authInput.trim()}
                    onClick={() => onAddAuthObject(authInput.trim())}
                  >
                    {t('authPanel.add')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('authPanel.addTip')}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4" />
              {t('authPanel.helpText')}
            </p>
          </section>

          <section className="rounded-lg border bg-background/65 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-5 w-1 rounded-full bg-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                {t('authPanel.addedCount', { count: authObjects.length })}
              </h4>
            </div>

            {authObjects.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {authObjects.map((authObj, index) => (
                  <div
                    key={index}
                    className="group/item flex min-h-16 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UserRound className="h-4.5 w-4.5" />
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {authObj}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          onClick={() => onRemoveAuthObject(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('authPanel.removeTip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                {t('authPanel.empty')}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  },
);
