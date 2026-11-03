import { forwardRef, useReducer, type ReactNode, type SVGProps } from 'react';
import { ICONS, iconElements, type IconName } from '@ddlbuilder/design/icons';
import { cn } from '@/lib/utils';

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'strokeWidth'> {
  size?: number;
}

// Stroke weight, wash and echo depend on the rendered size, and call sites set it with
// Tailwind classes, so the size is read from them unless passed explicitly.
const SIZE_CLASS = /(?:^|\s)(?:size|h|w)-(\d+(?:\.\d+)?)(?=\s|$)/;

function sizeOf(className: string | undefined): number {
  const match = className?.match(SIZE_CLASS);

  return match ? Number(match[1]) * 4 : 16;
}

function createDrawnIcon(name: IconName, displayName: string) {
  const def = ICONS[name];

  const AppIcon = forwardRef<SVGSVGElement, AppIconProps>(({ size, className, ...props }, ref) => {
    const px = size ?? sizeOf(className);

    return (
      <svg
        ref={ref}
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        focusable="false"
        aria-hidden="true"
        data-tone={'tone' in def ? def.tone : undefined}
        className={cn('lm-ic', className)}
        {...props}
      >
        {iconElements(def, px).map(({ key, tag: Tag, ...attrs }) => (
          <Tag key={key} {...attrs} />
        ))}
      </svg>
    );
  });
  AppIcon.displayName = displayName;

  return AppIcon;
}

type SwapState = string | number | boolean;

interface Shown {
  state: SwapState;
  swapped: boolean;
}

function swapReducer(_shown: Shown, next: SwapState): Shown {
  return { state: next, swapped: true };
}

// Remounts its content when `state` changes so the new icon scales in; the first render stays still.
export function IconSwap({ state, children }: { state: SwapState; children: ReactNode }) {
  const [shown, swapTo] = useReducer(swapReducer, { state, swapped: false });

  if (shown.state !== state) swapTo(state);

  return (
    <span key={String(state)} className={cn('lm-ic-swap', shown.swapped && 'lm-ic-swap-in')}>
      {children}
    </span>
  );
}

export const AlertCircle = createDrawnIcon('error', 'AlertCircle');
export const AlertTriangle = createDrawnIcon('warning', 'AlertTriangle');
export const ArrowLeft = createDrawnIcon('arrowLeft', 'ArrowLeft');
export const ArrowRight = createDrawnIcon('arrowRight', 'ArrowRight');
export const Check = createDrawnIcon('check', 'Check');
export const CheckCircle2 = createDrawnIcon('success', 'CheckCircle2');
export const ChevronDown = createDrawnIcon('chevronDown', 'ChevronDown');
export const ChevronLeft = createDrawnIcon('chevronLeft', 'ChevronLeft');
export const ChevronRight = createDrawnIcon('chevronRight', 'ChevronRight');
export const ChevronUp = createDrawnIcon('chevronUp', 'ChevronUp');
export const Circle = createDrawnIcon('radioDot', 'Circle');
export const DragDropVerticalIcon = createDrawnIcon('dragHandle', 'DragDropVerticalIcon');
export const Info = createDrawnIcon('info', 'Info');
export const Loader2 = createDrawnIcon('loading', 'Loader2');
export const Minus = createDrawnIcon('minus', 'Minus');
export const MoreHorizontal = createDrawnIcon('more', 'MoreHorizontal');
export const Pause = createDrawnIcon('pause', 'Pause');
export const Play = createDrawnIcon('play', 'Play');
export const Plus = createDrawnIcon('plus', 'Plus');
export const Search = createDrawnIcon('search', 'Search');
export const SkipBack = createDrawnIcon('skipBack', 'SkipBack');
export const SkipForward = createDrawnIcon('skipForward', 'SkipForward');
export const WifiOff = createDrawnIcon('offline', 'WifiOff');
export const X = createDrawnIcon('close', 'X');
export const Trash2 = createDrawnIcon('delete', 'Trash2');
export const Pencil = createDrawnIcon('edit', 'Pencil');
export const Copy = createDrawnIcon('copy', 'Copy');
export const Download = createDrawnIcon('download', 'Download');
export const Upload = createDrawnIcon('upload', 'Upload');
export const Send = createDrawnIcon('send', 'Send');
export const Save = createDrawnIcon('save', 'Save');
export const RefreshCw = createDrawnIcon('refresh', 'RefreshCw');
export const RotateCcw = createDrawnIcon('undo', 'RotateCcw');
export const LogIn = createDrawnIcon('signIn', 'LogIn');
export const LogOut = createDrawnIcon('signOut', 'LogOut');
export const Mail = createDrawnIcon('mail', 'Mail');
export const MailCheck = createDrawnIcon('mailCheck', 'MailCheck');
export const Pin = createDrawnIcon('pin', 'Pin');
export const ListPlus = createDrawnIcon('listPlus', 'ListPlus');
export const FolderPlus = createDrawnIcon('folderPlus', 'FolderPlus');
export const FilePlus = createDrawnIcon('filePlus', 'FilePlus');
export const Share2 = createDrawnIcon('share', 'Share2');
export const ZoomIn = createDrawnIcon('zoomIn', 'ZoomIn');
export const ZoomOut = createDrawnIcon('zoomOut', 'ZoomOut');
export const Maximize = createDrawnIcon('fitView', 'Maximize');
export const Calendar = createDrawnIcon('calendar', 'Calendar');
export const Sun = createDrawnIcon('sun', 'Sun');
export const Moon = createDrawnIcon('moon', 'Moon');
export const PlusCircle = createDrawnIcon('addCircle', 'PlusCircle');
export const Ban = createDrawnIcon('ban', 'Ban');
export const Eye = createDrawnIcon('eye', 'Eye');
export const Settings = createDrawnIcon('settings', 'Settings');
export const Settings2 = createDrawnIcon('sliders', 'Settings2');
export const SlidersHorizontal = createDrawnIcon('sliders', 'SlidersHorizontal');
export const Columns3Cog = createDrawnIcon('columns', 'Columns3Cog');
export const LayoutGrid = createDrawnIcon('layoutGrid', 'LayoutGrid');
export const LayoutTwoColumn = createDrawnIcon('layoutColumns', 'LayoutTwoColumn');
export const LayoutTwoRow = createDrawnIcon('layoutRows', 'LayoutTwoRow');
export const AlignLeft = createDrawnIcon('alignLeft', 'AlignLeft');
export const AlignJustify = createDrawnIcon('alignJustify', 'AlignJustify');
export const Code2 = createDrawnIcon('code', 'Code2');
export const Languages = createDrawnIcon('language', 'Languages');
export const MessageCircle = createDrawnIcon('message', 'MessageCircle');
export const CircleHelp = createDrawnIcon('help', 'CircleHelp');
export const Table = createDrawnIcon('table', 'Table');
export const TableProperties = createDrawnIcon('mockData', 'TableProperties');
export const Database = createDrawnIcon('database', 'Database');
export const HardDrive = createDrawnIcon('hardDrive', 'HardDrive');
export const Layers = createDrawnIcon('layers', 'Layers');
export const Sparkles = createDrawnIcon('sparkles', 'Sparkles');
export const Zap = createDrawnIcon('bolt', 'Zap');
export const WandSparkles = createDrawnIcon('wand', 'WandSparkles');
export const Lightbulb = createDrawnIcon('lightbulb', 'Lightbulb');
export const GraduationCap = createDrawnIcon('graduationCap', 'GraduationCap');
export const Key = createDrawnIcon('key', 'Key');
export const FileEdit = createDrawnIcon('draft', 'FileEdit');
export const FileInput = createDrawnIcon('importFile', 'FileInput');
export const History = createDrawnIcon('history', 'History');
export const Waypoints = createDrawnIcon('erDiagram', 'Waypoints');
export const GitCompare = createDrawnIcon('compare', 'GitCompare');
export const BookOpen = createDrawnIcon('book', 'BookOpen');
export const Star = createDrawnIcon('star', 'Star');
export const BarChart3 = createDrawnIcon('barChart', 'BarChart3');
export const Link2 = createDrawnIcon('link', 'Link2');
export const ShieldCheck = createDrawnIcon('shieldCheck', 'ShieldCheck');
export const Network = createDrawnIcon('network', 'Network');
export const ListChecks = createDrawnIcon('listChecks', 'ListChecks');
export const Grid3x3 = createDrawnIcon('grid', 'Grid3x3');
export const Clock = createDrawnIcon('clock', 'Clock');
export const Folder = createDrawnIcon('folder', 'Folder');
export const UserRound = createDrawnIcon('user', 'UserRound');
export const ArrowUp = createDrawnIcon('arrowUp', 'ArrowUp');
export const ArrowDown = createDrawnIcon('arrowDown', 'ArrowDown');
export const Modify = createDrawnIcon('modify', 'Modify');
export const DeleteForever = createDrawnIcon('deleteForever', 'DeleteForever');
export const AiEdit = createDrawnIcon('aiEdit', 'AiEdit');
export const AiComment = createDrawnIcon('aiComment', 'AiComment');
export const AiIndex = createDrawnIcon('aiIndex', 'AiIndex');
export const Workspace = createDrawnIcon('workspace', 'Workspace');
export const SeedData = createDrawnIcon('seedData', 'SeedData');
export const DataImport = createDrawnIcon('dataImport', 'DataImport');
export const ViewTable = createDrawnIcon('viewTable', 'ViewTable');
export const FieldTemplateIcon = createDrawnIcon('fieldTemplate', 'FieldTemplateIcon');
export const TableBlueprint = createDrawnIcon('tableBlueprint', 'TableBlueprint');
export const Replica = createDrawnIcon('replica', 'Replica');
export const Shard = createDrawnIcon('shard', 'Shard');
export const Query = createDrawnIcon('query', 'Query');
export const Index = createDrawnIcon('index', 'Index');
export const UniqueIndex = createDrawnIcon('uniqueIndex', 'UniqueIndex');
export const Fields = createDrawnIcon('fields', 'Fields');
