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
    <div className="rounded-lg border bg-card shadow-sm">
      <div
        className="flex items-center justify-between cursor-pointer border-b px-6 py-4 transition-colors hover:bg-muted/50"
        onClick={onToggleIndexCollapse}
      >
        <Label className="cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-base font-semibold text-primary">
            <Network className="h-4 w-4" />
            索引配置
          </span>
        </Label>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-200 ${
            isIndexCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isIndexCollapsed && (
        <div className="px-6 pb-6">
          <div className="space-y-4">
            {/* Field Input */}
            <div className="relative mt-2">
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
                    className="pr-4"
                  />
                </div>
              </div>

              {currentIndexFields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onAddIndex(false)}
                  >
                    <Hash className="h-4 w-4" />
                    添加索引
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onAddIndex(true)}
                  >
                    <Lock className="h-4 w-4" />
                    添加唯一索引
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
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
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
                  <div className="max-h-32 overflow-auto p-1">
                    {fieldSuggestions.map((field, index) => (
                      <div
                        key={field}
                        className={`flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-accent ${
                          index === selectedSuggestionIndex ? "bg-accent" : ""
                        }`}
                        onClick={() => onAddFieldToIndex(field)}
                        onMouseEnter={() => onSetSelectedSuggestionIndex(index)}
                      >
                        {field}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Fields as Labels */}
            {currentIndexFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {currentIndexFields.map((field, index) => (
                  <div
                    key={index}
                    className="group flex items-center gap-2 rounded-full border bg-muted px-3 py-1.5 text-sm"
                    onClick={() => onToggleFieldDirection(index)}
                  >
                    <span className="cursor-pointer">{field.name}</span>
                    {field.direction === "ASC" ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFieldFromIndex(index);
                      }}
                      className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
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
                <div className="text-base font-medium">已添加的索引</div>
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
                        className="flex items-start justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3"
                      >
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium ${badge.className}`}
                          >
                            <badge.Icon className="h-3.5 w-3.5" />
                            {badge.label}
                          </span>
                          <span className="break-words text-base font-medium leading-snug">
                            {index.name}
                          </span>
                          <span className="break-words text-sm leading-snug text-muted-foreground">
                            ({index.fields
                              .map(
                                (f) =>
                                  `${f.name}${f.direction === "DESC" ? " DESC" : ""}`
                              )
                              .join(", ")})
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onRemoveIndex(index.id)}
                        >
                          <X className="h-4 w-4" />
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
