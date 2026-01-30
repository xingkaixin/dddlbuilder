import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { isLoading, explanation, error, startExplain, clearExplain } =
    useDDLExplain();
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInteractingRef = useRef(false);

  const handleSelectionChange = useCallback(() => {
    // 如果正在与弹窗交互，不更新选区状态
    if (isInteractingRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      if (!showResult) setSelection(null);
      return;
    }

    try {
      const range = sel.getRangeAt(0);
      // 检查选区是否在目标容器内
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
        });
      } else {
        if (!showResult) setSelection(null);
      }
    } catch (e) {
      // 忽略 range 错误
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

  const handleClose = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowResult(false);
    setSelection(null);
    clearExplain();
  };

  // 点击外部关闭
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
  }, [showResult, clearExplain]);

  return (
    <div className="relative w-full h-full">
      {children}

      {selection &&
        !showResult &&
        createPortal(
          <div
            className="fixed z-50 -translate-x-1/2 -translate-y-full pb-2 animate-in fade-in zoom-in duration-200 pointer-events-auto"
            style={{ left: selection.x, top: selection.y }}
            onMouseDown={() => (isInteractingRef.current = true)}
            onMouseUp={() => {
              setTimeout(() => (isInteractingRef.current = false), 100);
            }}
          >
            <Button
              size="sm"
              className="h-8 gap-1.5 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
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
            className="fixed z-50 -translate-x-1/2 -translate-y-full pb-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto"
            style={{ left: selection.x, top: selection.y }}
          >
            <div className="w-80 rounded-xl border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col border-primary/20">
              <div className="flex items-center justify-between border-b px-3 py-2 bg-primary/5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  AI 解释
                </div>
                <button
                  onClick={handleClose}
                  className="rounded-full p-1 hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto p-3 text-sm leading-relaxed">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
                    <span className="text-xs text-muted-foreground animate-pulse">
                      正在解析代码...
                    </span>
                  </div>
                ) : error ? (
                  <div className="text-red-500 bg-red-50 p-2 rounded border border-red-100 italic text-xs">
                    {error}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-foreground/90 font-medium">
                    {explanation}
                  </div>
                )}
              </div>

              <div className="border-t px-3 py-1.5 bg-muted/30">
                <p className="text-[10px] text-muted-foreground italic">
                  选中内容: "{selection.text.slice(0, 30)}
                  {selection.text.length > 30 ? '...' : ''}"
                </p>
              </div>
            </div>
            <div className="absolute left-1/2 bottom-1.5 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-card" />
          </div>,
          document.body,
        )}
    </div>
  );
}
