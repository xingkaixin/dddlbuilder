import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, Loader2, X, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDDLExplain } from '@/hooks/useDDLExplain';

interface ExplainPopoverProps {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ExplainPopover({
  children,
  containerRef,
}: ExplainPopoverProps) {
  const [selection, setSelection] = useState<{
    text: string;
    x: number;
    y: number;
    bottom: number;
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { isLoading, isStreaming, isComplete, explanation, error, startExplain, clearExplain } =
    useDDLExplain();
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInteractingRef = useRef(false);

  const handleSelectionChange = useCallback(() => {
    if (isInteractingRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      if (!showResult) setSelection(null);
      return;
    }

    try {
      const range = sel.getRangeAt(0);
      const isInside =
        containerRef.current.contains(sel.anchorNode) ||
        containerRef.current.contains(sel.focusNode) ||
        containerRef.current.contains(range.commonAncestorContainer);

      if (!isInside) {
        if (!showResult) setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const text = sel.toString().trim();

      if (text.length > 0) {
        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top,
          bottom: rect.bottom,
        });
      } else {
        if (!showResult) setSelection(null);
      }
    } catch (_e) {
      // Ignore range errors
    }
  }, [containerRef, showResult]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const handleExplain = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selection) {
      startExplain(selection.text);
      setShowResult(true);
    }
  };

  const handleClose = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setShowResult(false);
      setSelection(null);
      clearExplain();
    },
    [clearExplain],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        showResult
      ) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResult, handleClose]);

  // 计算是否在上方显示
  const showOnTop = selection ? selection.y > 400 : true;

  return (
    <div className="relative w-full h-full">
      {children}

      {selection &&
        !showResult &&
        createPortal(
          <div
            className={`fixed z-[100] -translate-x-1/2 pb-2 animate-in fade-in zoom-in duration-200 pointer-events-auto ${
              showOnTop ? '-translate-y-full' : 'mt-2'
            }`}
            style={{
              left: selection.x,
              top: showOnTop ? selection.y : selection.bottom,
            }}
            onMouseDown={() => {
              isInteractingRef.current = true;
            }}
            onMouseUp={() => {
              setTimeout(() => {
                isInteractingRef.current = false;
              }, 100);
            }}
          >
            <Button
              size="sm"
              className="h-8 gap-1.5 shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground border border-white/20"
              onClick={handleExplain}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              解释选中
            </Button>
          </div>,
          document.body,
        )}

      {showResult &&
        selection &&
        createPortal(
          <div
            ref={popoverRef}
            className={`fixed z-[100] -translate-x-1/2 pb-3 animate-in fade-in duration-300 pointer-events-auto ${
              showOnTop
                ? '-translate-y-full slide-in-from-bottom-2'
                : 'pt-3 slide-in-from-top-2'
            }`}
            style={{
              left: selection.x,
              top: showOnTop ? selection.y : selection.bottom,
            }}
          >
            <div className="w-96 rounded-xl border bg-card/98 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col border-primary/20 ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b px-3 py-2 bg-primary/5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  AI 代码解释器
                  {(isLoading || isStreaming) && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary/60 ml-0.5" />
                  )}
                  {isComplete && !isStreaming && (
                    <Check className="h-3 w-3 text-green-500 animate-in zoom-in duration-300 ml-0.5" />
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="rounded-full p-1.5 hover:bg-muted/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="max-h-[min(500px,60vh)] overflow-y-auto p-4 text-sm leading-relaxed prose prose-sm prose-slate dark:prose-invert">
                {isLoading ? (
                  <div className="space-y-3 py-2">
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[85%]" />
                    <Skeleton className="h-4 w-[70%]" />
                    <Skeleton className="h-4 w-[80%]" />
                    <Skeleton className="h-4 w-[40%]" />
                  </div>
                ) : error ? (
                  <div className="text-red-500 bg-red-50/50 p-3 rounded-lg border border-red-100 text-xs font-medium">
                    {error}
                  </div>
                ) : (
                  <div className="text-foreground/90 markdown-content">
                    <ReactMarkdown>{explanation || ''}</ReactMarkdown>
                  </div>
                )}
              </div>

              <div className="border-t px-3.5 py-2 bg-muted/20">
                <p className="text-[10px] text-muted-foreground italic font-medium opacity-80">
                  选中片段: "{selection.text.slice(0, 45)}
                  {selection.text.length > 45 ? '...' : ''}"
                </p>
              </div>
            </div>
            {/* 这里的箭头逻辑需要根据 showOnTop 调整 */}
            {showOnTop ? (
              <div className="absolute left-1/2 bottom-1.5 -translate-x-1/2 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-card/98 drop-shadow-sm" />
            ) : (
              <div className="absolute left-1/2 top-1.5 -translate-x-1/2 border-l-[8px] border-r-[8px] border-b-[10px] border-l-transparent border-r-transparent border-b-primary/10" />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
