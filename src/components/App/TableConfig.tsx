import React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
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
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-base font-semibold">表信息配置</h2>
          <p className="text-xs text-muted-foreground">
            配置表名、注释和数据库类型
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1"
          onClick={onClearAll}
        >
          <Trash2 className="h-4 w-4" /> 清空所有
        </Button>
      </div>
      <div className="p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="table-name">表名</Label>
            <Input
              id="table-name"
              placeholder="例如: order_info"
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-comment">表中文名</Label>
            <Input
              id="table-comment"
              placeholder="例如: 订单信息表"
              value={tableComment}
              onChange={(event) => onTableCommentChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>数据库类型</Label>
            <Select
              value={dbType}
              onValueChange={(value) => onDbTypeChange(value as DatabaseType)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(() => {
                    const selectedOption = DATABASE_OPTIONS.find(
                      (option) => option.value === dbType
                    );
                    if (!selectedOption) return "请选择数据库类型";
                    const Icon = selectedOption.icon;
                    return (
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 ${
                            selectedOption.value === "mysql"
                              ? "text-blue-600"
                              : selectedOption.value === "postgresql"
                              ? "text-blue-800"
                              : selectedOption.value === "sqlserver"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        />
                        <span>{selectedOption.label}</span>
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
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 ${
                            option.value === "mysql"
                              ? "text-blue-600"
                              : option.value === "postgresql"
                              ? "text-blue-800"
                              : option.value === "sqlserver"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        />
                        <span>{option.label}</span>
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