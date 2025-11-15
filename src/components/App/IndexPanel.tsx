import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ChevronUp,
  ChevronDown,
  Network,
  X,
  Key,
  Lock,
  Hash,
} from "lucide-react";
import type { IndexField, IndexDefinition } from "@/types";

interface IndexPanelProps {
  isIndexCollapsed: boolean;
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  fieldSuggestions: string[];
  showFieldSuggestions: boolean;
  selectedSuggestionIndex: number;
  onToggleIndexCollapse: () => void;
  onIndexInputChange: (value: string) => void;
  onSetShowFieldSuggestions: (show: boolean) => void;
  onSetSelectedSuggestionIndex: (index: number) => void;
  onAddFieldToIndex: (field: string) => void;
  onRemoveFieldFromIndex: (index: number) => void;
  onToggleFieldDirection: (index: number) => void;
  onAddIndex: (unique?: boolean, primary?: boolean) => void;
  onRemoveIndex: (id: string) => void;
}

export const IndexPanel = memo<IndexPanelProps>(({
  isIndexCollapsed,
  indexInput,
  currentIndexFields,
  indexes,
  fieldSuggestions,
  showFieldSuggestions,
  selectedSuggestionIndex,
  onToggleIndexCollapse,
  onIndexInputChange,
  onSetShowFieldSuggestions,
  onSetSelectedSuggestionIndex,
  onAddFieldToIndex,
  onRemoveFieldFromIndex,
  onToggleFieldDirection,
  onAddIndex,
  onRemoveIndex,
}) => {
  return (
    <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

      <div
        className="relative flex items-center justify-between cursor-pointer border-b border-primary/10 px-4 py-3.5 transition-colors hover:bg-muted/50"
        onClick={onToggleIndexCollapse}
      >
        <Label className="cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-all duration-300 group-hover:bg-primary/15">
            <Network className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            索引配置
          </span>
        </Label>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-300 ${
            isIndexCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isIndexCollapsed && (
        <div className="relative px-4 pb-4">
          <div className="space-y-3">
            {/* Field Input */}
            <div className="relative mt-2 group/input">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="输入字段名进行匹配..."
                    value={indexInput}
                    onChange={(e) => {
                      onIndexInputChange(e.target.value);
                      onSetShowFieldSuggestions(e.target.value.trim().length > 0);
                      onSetSelectedSuggestionIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && fieldSuggestions.length > 0) {
                        e.preventDefault();
                        onAddFieldToIndex(fieldSuggestions[selectedSuggestionIndex]);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        onSetSelectedSuggestionIndex((prev) =>
                          prev < fieldSuggestions.length - 1 ? prev + 1 : prev
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        onSetSelectedSuggestionIndex((prev) =>
                          prev > 0 ? prev - 1 : 0
                        );
                      } else if (e.key === "Escape") {
                        onSetShowFieldSuggestions(false);
                      } else if (
                        e.key === "Backspace" &&
                        indexInput === "" &&
                        currentIndexFields.length > 0
                      ) {
                        e.preventDefault();
                        onRemoveFieldFromIndex(currentIndexFields.length - 1);
                      }
                    }}
                    className="pr-4 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {currentIndexFields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md group-hover:bg-primary/5"
                    onClick={() => onAddIndex(false)}
                  >
                    <Hash className="h-4 w-4" />
                    添加索引
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md group-hover:bg-primary/5"
                    onClick={() => onAddIndex(true)}
                  >
                    <Lock className="h-4 w-4" />
                    添加唯一索引
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md group-hover:bg-primary/5"
                    onClick={() => onAddIndex(true, true)}
                    disabled={indexes.some((index) => index.isPrimary)}
                  >
                    <Key className="h-4 w-4" />
                    添加主键
                  </Button>
                </div>
              )}

              {/* Field Suggestions Dropdown */}
              {showFieldSuggestions && fieldSuggestions.length > 0 && (
                <div className="absolute z-10 mt-2 w-full rounded-lg border bg-popover shadow-xl overflow-hidden">
                  <div className="max-h-32 overflow-auto">
                    {fieldSuggestions.map((field, index) => (
                      <div
                        key={field}
                        className={`flex cursor-pointer items-center px-3 py-2 text-sm transition-all duration-150 ${
                          index === selectedSuggestionIndex
                            ? "bg-accent text-accent-foreground pl-4"
                            : "hover:bg-accent hover:text-accent-foreground hover:pl-4"
                        }`}
                        onClick={() => onAddFieldToIndex(field)}
                        onMouseEnter={() => onSetSelectedSuggestionIndex(index)}
                      >
                        <span className="text-primary mr-2 transition-transform duration-200 group-hover/input:scale-110">›</span>
                        {field}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Fields as Labels */}
            {currentIndexFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {currentIndexFields.map((field, index) => (
                  <div
                    key={index}
                    className="group inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm transition-all duration-300 hover:bg-primary/10 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                    onClick={() => onToggleFieldDirection(index)}
                  >
                    <span className="font-medium text-foreground hover:text-primary transition-colors">{field.name}</span>
                    {field.direction === "ASC" ? (
                      <ChevronUp className="h-4 w-4 text-primary transition-transform duration-200 group-hover:scale-110" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-primary transition-transform duration-200 group-hover:scale-110" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFieldFromIndex(index);
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-200 hover:rotate-90"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Added Indexes */}
            {indexes.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-semibold relative pb-2">
                  已添加的索引
                  <div className="absolute bottom-0 left-0 w-10 h-0.5 bg-gradient-to-r from-primary to-transparent rounded" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {indexes.map((index) => {
                    const badge = index.isPrimary
                      ? {
                          label: "主键",
                          className: "bg-orange-100 text-orange-800",
                          Icon: Key,
                        }
                      : index.unique
                      ? {
                          label: "唯一",
                          className: "bg-blue-100 text-blue-800",
                          Icon: Lock,
                        }
                      : {
                          label: "普通",
                          className: "bg-emerald-100 text-emerald-700",
                          Icon: Hash,
                        };

                    return (
                      <div
                        key={index.id}
                        className="group/item relative flex items-start justify-between gap-4 rounded-xl border bg-muted/50 px-5 py-4 transition-all duration-300 hover:bg-muted/70 hover:-translate-y-1 hover:shadow-lg overflow-hidden"
                      >
                        {/* Left gradient bar */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 to-transparent transition-all duration-300 group-hover/item:w-2" />

                        <div className="relative flex flex-1 flex-wrap items-center gap-3 pl-2">
                          <span
                            className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold transition-transform duration-200 ${badge.className} group-hover/item:scale-105`}
                          >
                            <badge.Icon className="h-4 w-4" />
                            {badge.label}
                          </span>
                          <span className="break-words text-base font-semibold leading-snug transition-colors duration-200 group-hover/item:text-primary">
                            {index.name}
                          </span>
                          <div className="w-full pl-1">
                            <span className="break-words text-sm leading-relaxed text-muted-foreground transition-colors duration-200 group-hover/item:text-muted-foreground/80">
                              ({index.fields
                                .map(
                                  (f) =>
                                    `${f.name}${f.direction === "DESC" ? " DESC" : ""}`
                                )
                                .join(", ")})
                            </span>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="transition-all duration-200 hover:scale-110 hover:bg-destructive/10"
                          onClick={() => onRemoveIndex(index.id)}
                        >
                          <X className="h-4 w-4 transition-transform duration-200 group-hover/item:rotate-90" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
