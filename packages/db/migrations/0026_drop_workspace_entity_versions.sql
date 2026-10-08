-- version 与 workspace_clocks 只服务已退役的 changes 游标；checkpoint 不再分配版本号
ALTER TABLE workspace_entities DROP COLUMN version;

DROP TABLE workspace_clocks;
