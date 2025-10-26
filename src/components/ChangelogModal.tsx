import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { changelogData } from '@/data/changelog'

interface ChangelogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangelogModal({ open, onOpenChange }: ChangelogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{changelogData.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {changelogData.entries.map((entry) => (
            <div key={entry.version} className="border-b pb-4 last:border-b-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-foreground">
                  [{entry.version}]
                </h3>
                <span className="text-sm text-muted-foreground">
                  {entry.date}
                </span>
              </div>

              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h4: ({ children, ...props }) => (
                      <h4 className="text-base font-medium mb-2 mt-4" {...props}>
                        {children}
                      </h4>
                    ),
                    ul: ({ children, ...props }) => (
                      <ul className="list-disc pl-6 space-y-1 mb-4" {...props}>
                        {children}
                      </ul>
                    ),
                    li: ({ children, ...props }) => (
                      <li className="text-sm leading-relaxed" {...props}>
                        {children}
                      </li>
                    ),
                    p: ({ children, ...props }) => (
                      <p className="text-sm leading-relaxed mb-3" {...props}>
                        {children}
                      </p>
                    ),
                  }}
                >
                  {entry.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}