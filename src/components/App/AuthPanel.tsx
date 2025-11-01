import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronDown, ShieldUser, X } from "lucide-react";

interface AuthPanelProps {
  isAuthCollapsed: boolean;
  authInput: string;
  authObjects: string[];
  onToggleAuthCollapse: () => void;
  onAuthInputChange: (value: string) => void;
  onAddAuthObject: (value: string) => void;
  onRemoveAuthObject: (index: number) => void;
}

export const AuthPanel = memo<AuthPanelProps>(({
  isAuthCollapsed,
  authInput,
  authObjects,
  onToggleAuthCollapse,
  onAuthInputChange,
  onAddAuthObject,
  onRemoveAuthObject,
}) => {
  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div
        className="flex items-center justify-between cursor-pointer border-b px-6 py-4 transition-colors hover:bg-muted/50"
        onClick={onToggleAuthCollapse}
      >
        <Label className="cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-base font-semibold text-primary">
            <ShieldUser className="h-4 w-4" />
            授权配置
          </span>
        </Label>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-200 ${
            isAuthCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isAuthCollapsed && (
        <div className="px-6 pb-6">
          <div className="space-y-4">
            {/* Authorization Object Input */}
            <div className="mt-2">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="输入授权对象名称..."
                    value={authInput}
                    onChange={(e) => {
                      onAuthInputChange(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && authInput.trim()) {
                        e.preventDefault();
                        onAddAuthObject(authInput.trim());
                      } else if (
                        e.key === "Backspace" &&
                        authInput === "" &&
                        authObjects.length > 0
                      ) {
                        e.preventDefault();
                        onRemoveAuthObject(authObjects.length - 1);
                      }
                    }}
                    className="pr-4"
                  />
                </div>
                {authInput.trim() && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAddAuthObject(authInput.trim())}
                  >
                    添加
                  </Button>
                )}
              </div>
            </div>

            {/* Added Authorization Objects */}
            {authObjects.length > 0 && (
              <div className="space-y-3">
                <div className="text-base font-medium">已添加的授权对象</div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {authObjects.map((authObj, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-4 rounded-lg border bg-muted/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-700">
                          <ShieldUser className="h-4 w-4" />
                          授权对象
                        </span>
                        <span className="text-base font-medium">{authObj}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveAuthObject(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
