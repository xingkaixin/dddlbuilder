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
        <header className="relative border-b bg-card/95 backdrop-blur-sm shadow-sm">
          {/* Decorative gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

          <div className="relative px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 group">
                <img
                  src="/logo.svg"
                  alt="筑表师 Logo"
                  className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                />
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent tracking-tight">
                    筑表师
                  </h1>
                  <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                    专业的数据库建表工具
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full inline-block">
                  v{packageInfo.version}
                </div>
                <div>
                  <button
                    onClick={() => setShowChangelog(true)}
                    className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-all duration-200 hover:translate-x-0.5"
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary transition-all duration-200 group-hover:scale-150" />
                    更新日志
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <ChangelogModal open={showChangelog} onOpenChange={setShowChangelog} />
      </>
    );
  },
);
