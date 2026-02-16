// Backward-compatible barrel.
// Keep existing imports (`@/utils/alterDdlGenerator`) stable while logic moves to submodules.
export { generateAlterDDL, generateRollbackDDL } from './alter-ddl';
