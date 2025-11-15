import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changelogData } from "@/data/changelog";

interface ChangelogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogModal({ open, onOpenChange }: ChangelogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto backdrop-blur-md bg-card/95 border border-primary/20 shadow-2xl shadow-primary/10">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

        {/* Floating particles effect */}
        <div className="pointer-events-none absolute top-4 right-4 w-20 h-20 opacity-10">
          <div className="absolute inset-0 rounded-full bg-primary animate-ping" />
        </div>

        <DialogHeader className="relative pb-4 border-b border-primary/10">
          <DialogTitle className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            {changelogData.title}
          </DialogTitle>
          <div className="absolute bottom-0 left-0 w-24 h-0.5 bg-gradient-to-r from-primary to-transparent" />
        </DialogHeader>

        <div className="space-y-8 mt-6">
          {changelogData.entries.map((entry, index) => (
            <div
              key={entry.version}
              className="relative pb-8 last:pb-0 border-b last:border-b-0 border-border/50 group transition-all duration-300 hover:translate-x-1"
            >
              {/* Vertical timeline line */}
              <div className="absolute -left-3 top-0 bottom-0 w-px bg-gradient-to-b from-primary/30 to-transparent" />

              {/* Timeline dot */}
              <div className="absolute -left-3 top-2 w-2 h-2 rounded-full bg-primary ring-2 ring-primary/30 transition-all duration-300 group-hover:scale-150 group-hover:bg-primary/80" />

              {/* Glow effect on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />

              <div className="flex items-center justify-between mb-6 pl-6">
                <div className="flex items-center gap-3">
                  {/* Version badge with tech aesthetic */}
                  <div className="relative">
                    <div className="px-4 py-1.5 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 backdrop-blur-sm">
                      <span className="font-mono text-lg font-bold text-primary tracking-wider">
                        v{entry.version}
                      </span>
                    </div>
                    <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
                <span className="text-sm text-muted-foreground font-medium bg-muted/50 px-3 py-1 rounded-full backdrop-blur-sm">
                  {entry.date}
                </span>
              </div>

              <div className="pl-6">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h4: ({ children, ...props }) => (
                        <h4
                          className="text-base font-semibold mb-3 mt-5 text-foreground flex items-center gap-2"
                          {...props}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {children}
                        </h4>
                      ),
                      ul: ({ children, ...props }) => (
                        <ul className="list-none pl-0 space-y-3 mb-5" {...props}>
                          {children}
                        </ul>
                      ),
                      li: ({ children, ...props }) => (
                        <li
                          className="text-sm leading-relaxed text-foreground/90 pl-0 relative flex gap-3 group/li transition-all duration-200 hover:text-foreground hover:pl-2"
                          {...props}
                        >
                          <span className="text-primary mt-0.5 transition-transform duration-200 group-hover/li:scale-110">
                            ›
                          </span>
                          <span className="flex-1">{children}</span>
                        </li>
                      ),
                      p: ({ children, ...props }) => (
                        <p className="text-sm leading-relaxed text-foreground/90 mb-4" {...props}>
                          {children}
                        </p>
                      ),
                      strong: ({ children, ...props }) => (
                        <strong className="font-semibold text-foreground" {...props}>
                          {children}
                        </strong>
                      ),
                      em: ({ children, ...props }) => (
                        <em className="text-primary/80 not-italic bg-primary/10 px-1 rounded" {...props}>
                          {children}
                        </em>
                      ),
                    }}
                  >
                    {entry.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Section transition effect */}
              <div className="absolute bottom-0 left-6 right-0 h-px bg-gradient-to-r from-border to-transparent" />
            </div>
          ))}
        </div>
      </DialogContent>
      <style jsx>{`
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: hsl(var(--muted) / 0.3);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb {
          background: hsl(var(--primary) / 0.4);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.6);
        }
      `}</style>
    </Dialog>
  );
}
