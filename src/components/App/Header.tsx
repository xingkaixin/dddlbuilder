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
        <header className="border-b bg-card shadow-sm">
          <div className="px-4 py-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src="/favicon.png"
                  alt="筑表师 Logo"
                  className="h-10 w-10 rounded"
                />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">筑表师</h1>
                  <p className="text-sm text-muted-foreground">
                    专业的数据库建表工具
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">
                  v{import.meta.env.VITE_APP_VERSION || "0.1.0"}
                </div>
                <button
                  onClick={() => setShowChangelog(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
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
