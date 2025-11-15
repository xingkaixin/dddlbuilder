import React from "react";
import { memo } from "react";
import { ChangelogModal } from "@/components/ChangelogModal";
import packageInfo from "../../../package.json";

interface HeaderProps {
  showChangelog: boolean;
  setShowChangelog: (show: boolean) => void;
}

export const Header = memo<HeaderProps>(
  ({ showChangelog, setShowChangelog }) => {
    return (
      <>
        <header className="border-b bg-card shadow-sm">
          <div className="px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src="/logo.svg"
                  alt="筑表师 Logo"
                  className="h-10 w-10 text-primary"
                />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">筑表师</h1>
                  <p className="text-base text-muted-foreground">
                    专业的数据库建表工具
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 text-sm text-muted-foreground">
                  v{packageInfo.version}
                </div>
                <button
                  onClick={() => setShowChangelog(true)}
                  className="text-sm text-primary hover:text-primary/80 hover:underline"
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
