import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronDown, X } from "lucide-react";

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
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleAuthCollapse}
      >
        <Label className="text-base font-medium cursor-pointer">
          授权对象配置
        </Label>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isAuthCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isAuthCollapsed && (
        <div className="px-4 pb-4">
          <div className="space-y-3">
            {/* Authorization Object Input */}
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                    className="pr-20"
                  />
                  {authInput.trim() && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => onAddAuthObject(authInput.trim())}
                      >
                        添加
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Added Authorization Objects */}
            {authObjects.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">已添加的授权对象</div>
                <div className="space-y-1">
                  {authObjects.map((authObj, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{authObj}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => onRemoveAuthObject(index)}
                      >
                        <X className="h-3 w-3" />
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