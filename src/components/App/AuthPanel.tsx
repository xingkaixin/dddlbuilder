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
    <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

      <div
        className="relative flex items-center justify-between cursor-pointer border-b border-primary/10 px-4 py-3.5 transition-colors hover:bg-muted/50"
        onClick={onToggleAuthCollapse}
      >
        <Label className="cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-all duration-300 group-hover:bg-primary/15">
            <ShieldUser className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            授权配置
          </span>
        </Label>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-300 ${
            isAuthCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isAuthCollapsed && (
        <div className="relative px-4 pb-4">
          <div className="space-y-2">
            {/* Authorization Object Input */}
            <div className="relative mt-2 group/input">
              <div className="flex flex-wrap gap-2">
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
                    className="pr-4 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {authInput.trim() && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="transition-all duration-200 hover:scale-105 hover:shadow-md group-hover/input:bg-primary/5"
                    onClick={() => onAddAuthObject(authInput.trim())}
                  >
                    添加
                  </Button>
                )}
              </div>
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
      )}
    </div>
  );
});
