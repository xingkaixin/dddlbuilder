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
    <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

      <div className="relative flex items-center justify-between border-b border-primary/10 px-4 py-3.5">
        <div className="inline-flex items-center gap-2 rounded-full px-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-all duration-300 group-hover:bg-primary/15">
            <Table className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            表配置
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
          onClick={onClearAll}
        >
          <Trash2 className="h-4 w-4 transition-transform duration-200" /> 清空所有
        </Button>
      </div>
      <div className="relative p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3 group/field">
            <Label htmlFor="table-name" className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary">
              表名
            </Label>
            <Input
              id="table-name"
              placeholder="例如: order_info"
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-3 group/field">
            <Label htmlFor="table-comment" className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary">
              表中文名
            </Label>
            <Input
              id="table-comment"
              placeholder="例如: 订单信息表"
              value={tableComment}
              onChange={(event) => onTableCommentChange(event.target.value)}
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-3 group/field">
            <Label className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary">
              数据库类型
            </Label>
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
                    <SelectItem key={option.value} value={option.value} className="transition-colors hover:bg-accent">
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
