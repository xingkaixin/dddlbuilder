import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Table, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DatabaseType } from "@/types";
import { DATABASE_OPTIONS } from "@/utils/constants";

interface TableConfigProps {
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  onTableNameChange: (value: string) => void;
  onTableCommentChange: (value: string) => void;
  onDbTypeChange: (value: DatabaseType) => void;
  onClearAll: () => void;
}

export const TableConfig = memo<TableConfigProps>(({
  tableName,
  tableComment,
  dbType,
  onTableNameChange,
  onTableCommentChange,
  onDbTypeChange,
  onClearAll,
}) => {
  return (
    <div className="group relative rounded-lg border border-border bg-card shadow-md transition-all duration-200 hover:shadow-lg">
      <div className="absolute -left-px top-4 h-8 w-1 rounded-r bg-gradient-to-b from-primary to-accent opacity-70 group-hover:opacity-100 transition-opacity"></div>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-base font-semibold text-primary">
            <Table className="h-4 w-4" />
            表配置
          </span>
          <div className="absolute -bottom-1 left-0 h-0.5 w-12 bg-gradient-to-r from-primary to-accent rounded"></div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
          onClick={onClearAll}
        >
          <Trash2 className="h-4 w-4" /> 清空所有
        </Button>
      </div>
      <div className="p-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3">
            <Label htmlFor="table-name" className="text-sm font-medium text-foreground">表名</Label>
            <Input
              id="table-name"
              placeholder="例如: order_info"
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="table-comment" className="text-sm font-medium text-foreground">表中文名</Label>
            <Input
              id="table-comment"
              placeholder="例如: 订单信息表"
              value={tableComment}
              onChange={(event) => onTableCommentChange(event.target.value)}
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">数据库类型</Label>
            <Select
              value={dbType}
              onValueChange={(value) => onDbTypeChange(value as DatabaseType)}
            >
              <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                <SelectValue>
                  {(() => {
                    const selectedOption = DATABASE_OPTIONS.find(
                      (option) => option.value === dbType
                    );
                    if (!selectedOption) return "请选择数据库类型";
                    const Icon = selectedOption.icon;
                    return (
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-medium">{selectedOption.label}</span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DATABASE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-medium">{option.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
});
