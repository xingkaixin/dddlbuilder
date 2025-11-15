import React from "react";
import { memo } from "react";
import { ChangelogModal } from "@/components/ChangelogModal";

interface HeaderProps {
  showChangelog: boolean;
  setShowChangelog: (show: boolean) => void;
}

export const Header = memo<HeaderProps>(
  ({ showChangelog, setShowChangelog }) => {
    return (
      <>
        <header className="border-b border-border bg-gradient-to-r from-secondary to-card">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src="/favicon.png"
                    alt="筑表师 Logo"
                    className="h-12 w-12 rounded-lg shadow-lg ring-1 ring-border"
                  />
                  <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/20 to-accent/20 blur-md -z-10"></div>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
                    筑表师
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    专业的数据库建表工具
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  v{import.meta.env.VITE_APP_VERSION || "0.2.4"}
                </div>
                <button
                  onClick={() => setShowChangelog(true)}
                  className="text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
                >
                  更新日志
                </button>
              </div>
            </div>
          </div>
        </header>

        <ChangelogModal open={showChangelog} onOpenChange={setShowChangelog} />
      </>
    );
  },
);
