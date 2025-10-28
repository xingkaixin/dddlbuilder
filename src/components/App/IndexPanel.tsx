import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, X } from "lucide-react";
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
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleIndexCollapse}
      >
        <Label className="text-base font-medium cursor-pointer">
          索引配置
        </Label>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isIndexCollapsed ? "rotate-180" : ""
          }`}
        />
      </div>

      {!isIndexCollapsed && (
        <div className="px-4 pb-4">
          <div className="space-y-3">
            {/* Field Input */}
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                    className="pr-20"
                  />
                  {currentIndexFields.length > 0 && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => onAddIndex(false)}
                      >
                        添加索引
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => onAddIndex(true)}
                      >
                        添加唯一索引
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-6 px-2 text-xs ${
                          indexes.some((index) => index.isPrimary)
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                        onClick={() => onAddIndex(true, true)}
                        disabled={indexes.some((index) => index.isPrimary)}
                      >
                        添加主键
                      </Button>
                    </div>
                  )}
                </div>
              </div>

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
              <div className="flex flex-wrap items-center gap-2">
                {currentIndexFields.map((field, index) => (
                  <div
                    key={index}
                    className="group flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-sm"
                    onClick={() => onToggleFieldDirection(index)}
                  >
                    <span className="cursor-pointer">{field.name}</span>
                    {field.direction === "ASC" ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFieldFromIndex(index);
                      }}
                      className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Added Indexes */}
            {indexes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">已添加的索引</div>
                <div className="space-y-1">
                  {indexes.map((index) => (
                    <div
                      key={index.id}
                      className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{index.name}</span>
                        {index.isPrimary && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800 font-medium">
                            主键
                          </span>
                        )}
                        {index.unique && !index.isPrimary && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                            唯一
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          (
                          {index.fields
                            .map(
                              (f) =>
                                `${f.name}${f.direction === "DESC" ? " DESC" : ""}`
                            )
                            .join(", ")}
                          )
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => onRemoveIndex(index.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});