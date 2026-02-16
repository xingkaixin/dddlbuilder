import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldUser, X, Plus } from 'lucide-react';

interface AuthPanelProps {
  authInput: string;
  authObjects: string[];
  onAuthInputChange: (value: string) => void;
  onAddAuthObject: (value: string) => void;
  onRemoveAuthObject: (index: number) => void;
}

export const AuthPanel = memo<AuthPanelProps>(
  ({
    authInput,
    authObjects,
    onAuthInputChange,
    onAddAuthObject,
    onRemoveAuthObject,
  }) => {
    return (
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative p-4">
          <div className="space-y-2">
            {/* Authorization Object Input */}
            <div className="relative group/input">
              <div className="w-full max-w-sm">
                <Input
                  placeholder="输入授权对象名称..."
                  value={authInput}
                  onChange={(e) => {
                    onAuthInputChange(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && authInput.trim()) {
                      e.preventDefault();
                      onAddAuthObject(authInput.trim());
                    } else if (
                      e.key === 'Backspace' &&
                      authInput === '' &&
                      authObjects.length > 0
                    ) {
                      e.preventDefault();
                      onRemoveAuthObject(authObjects.length - 1);
                    }
                  }}
                  className="pr-4 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {authInput.trim() && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md group-hover/input:bg-primary/5"
                    onClick={() => onAddAuthObject(authInput.trim())}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
              )}
            </div>

            {/* Added Authorization Objects */}
            {authObjects.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold relative pb-2">
                  已添加的授权对象
                  <div className="absolute bottom-0 left-0 w-10 h-0.5 bg-gradient-to-r from-primary to-transparent rounded" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {authObjects.map((authObj, index) => (
                    <div
                      key={index}
                      className="group/item relative flex items-center justify-between gap-2 rounded-xl border bg-muted/50 px-4 py-3 transition-all duration-300 hover:bg-muted/70 hover:-translate-y-0.5 hover:shadow-md overflow-hidden"
                    >
                      {/* Left gradient bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 to-transparent transition-all duration-300 group-hover/item:w-2" />

                      <div className="relative flex items-center gap-2 pl-2">
                        <span className="inline-flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-transform duration-200 group-hover/item:scale-105">
                          <ShieldUser className="h-4 w-4" />
                          授权对象
                        </span>
                        <span className="text-sm font-semibold transition-colors duration-200 group-hover/item:text-primary">
                          {authObj}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="transition-all duration-200 hover:scale-110 hover:bg-destructive/10"
                        onClick={() => onRemoveAuthObject(index)}
                      >
                        <X className="h-4 w-4 transition-transform duration-200 group-hover/item:rotate-90" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
