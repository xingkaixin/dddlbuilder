import { forwardRef, type SVGProps } from 'react';
import { ICONS, iconElements, type IconName } from '@ddlbuilder/design/icons';
import {
  AlignJustify as AlignJustifyData,
  AlignLeft as AlignLeftData,
  BanIcon as BanData,
  Chart03Icon as BarChart3Data,
  BookOpen as BookOpenData,
  Bot as BotData,
  Calendar as CalendarData,
  Clock as ClockData,
  CodeSimpleIcon as Code2Data,
  ColumnsThreeCogIcon as Columns3CogData,
  Copy as CopyData,
  Database as DatabaseData,
  Download as DownloadData,
  Eye as EyeData,
  FileEditIcon as FileEditData,
  FileInput as FileInputData,
  FilePlus as FilePlusData,
  FileText as FileTextData,
  Folder as FolderData,
  FolderOpen as FolderOpenData,
  FolderPlus as FolderPlusData,
  GitBranch as GitBranchData,
  GitCompare as GitCompareData,
  GraduationCap as GraduationCapData,
  Grid3x3 as Grid3x3Data,
  HardDrive as HardDriveData,
  Hash as HashData,
  History as HistoryData,
  Key as KeyData,
  KeyRound as KeyRoundData,
  Languages as LanguagesData,
  Layers as LayersData,
  LayoutGrid as LayoutGridData,
  LayoutTemplate as LayoutTemplateData,
  Lightbulb as LightbulbData,
  Link2 as Link2Data,
  ListChecks as ListChecksData,
  ListPlus as ListPlusData,
  ListTree as ListTreeData,
  Lock as LockData,
  LogIn as LogInData,
  LogOut as LogOutData,
  Mail as MailData,
  MailCheck as MailCheckData,
  Maximize as MaximizeData,
  MessageCircle as MessageCircleData,
  Moon as MoonData,
  Network as NetworkData,
  Pencil as PencilData,
  Pin as PinData,
  PlusSignCircleIcon as PlusCircleData,
  RefreshCw as RefreshCwData,
  RotateCcw as RotateCcwData,
  Save as SaveData,
  Send as SendData,
  Settings as SettingsData,
  Settings2 as Settings2Data,
  Share2 as Share2Data,
  ShieldCheck as ShieldCheckData,
  SlidersHorizontal as SlidersHorizontalData,
  Sparkles as SparklesData,
  Star as StarData,
  Sun as SunData,
  LayoutTwoColumnIcon as LayoutTwoColumnData,
  LayoutTwoRowIcon as LayoutTwoRowData,
  HelpCircleIcon as CircleHelpData,
  Table as TableData,
  Table2 as Table2Data,
  Table03Icon as TablePropertiesData,
  Trash2 as Trash2Data,
  Upload as UploadData,
  UserRound as UserRoundData,
  WandSparkles as WandSparklesData,
  Route01Icon as WaypointsData,
  Zap as ZapData,
  ZoomIn as ZoomInData,
  ZoomOut as ZoomOutData,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { cn } from '@/lib/utils';

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'strokeWidth'> {
  size?: number;
}

function createAppIcon(icon: IconSvgElement, displayName: string) {
  const AppIcon = forwardRef<SVGSVGElement, AppIconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} strokeWidth={1.7} focusable="false" {...props} />
  ));
  AppIcon.displayName = displayName;

  return AppIcon;
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

export const AlignJustify = createAppIcon(AlignJustifyData, 'AlignJustify');
export const AlignLeft = createAppIcon(AlignLeftData, 'AlignLeft');
export const Ban = createAppIcon(BanData, 'Ban');
export const BarChart3 = createAppIcon(BarChart3Data, 'BarChart3');
export const BookOpen = createAppIcon(BookOpenData, 'BookOpen');
export const Bot = createAppIcon(BotData, 'Bot');
export const Calendar = createAppIcon(CalendarData, 'Calendar');
export const Clock = createAppIcon(ClockData, 'Clock');
export const Code2 = createAppIcon(Code2Data, 'Code2');
export const Columns3Cog = createAppIcon(Columns3CogData, 'Columns3Cog');
export const Copy = createAppIcon(CopyData, 'Copy');
export const Database = createAppIcon(DatabaseData, 'Database');
export const Download = createAppIcon(DownloadData, 'Download');
export const Eye = createAppIcon(EyeData, 'Eye');
export const FileEdit = createAppIcon(FileEditData, 'FileEdit');
export const FileInput = createAppIcon(FileInputData, 'FileInput');
export const FilePlus = createAppIcon(FilePlusData, 'FilePlus');
export const FileText = createAppIcon(FileTextData, 'FileText');
export const Folder = createAppIcon(FolderData, 'Folder');
export const FolderOpen = createAppIcon(FolderOpenData, 'FolderOpen');
export const FolderPlus = createAppIcon(FolderPlusData, 'FolderPlus');
export const GitBranch = createAppIcon(GitBranchData, 'GitBranch');
export const GitCompare = createAppIcon(GitCompareData, 'GitCompare');
export const GraduationCap = createAppIcon(GraduationCapData, 'GraduationCap');
export const Grid3x3 = createAppIcon(Grid3x3Data, 'Grid3x3');
export const HardDrive = createAppIcon(HardDriveData, 'HardDrive');
export const Hash = createAppIcon(HashData, 'Hash');
export const History = createAppIcon(HistoryData, 'History');
export const Key = createAppIcon(KeyData, 'Key');
export const KeyRound = createAppIcon(KeyRoundData, 'KeyRound');
export const Languages = createAppIcon(LanguagesData, 'Languages');
export const Layers = createAppIcon(LayersData, 'Layers');
export const LayoutGrid = createAppIcon(LayoutGridData, 'LayoutGrid');
export const LayoutTemplate = createAppIcon(LayoutTemplateData, 'LayoutTemplate');
export const Lightbulb = createAppIcon(LightbulbData, 'Lightbulb');
export const Link2 = createAppIcon(Link2Data, 'Link2');
export const ListChecks = createAppIcon(ListChecksData, 'ListChecks');
export const ListPlus = createAppIcon(ListPlusData, 'ListPlus');
export const ListTree = createAppIcon(ListTreeData, 'ListTree');
export const Lock = createAppIcon(LockData, 'Lock');
export const LogIn = createAppIcon(LogInData, 'LogIn');
export const LogOut = createAppIcon(LogOutData, 'LogOut');
export const Mail = createAppIcon(MailData, 'Mail');
export const MailCheck = createAppIcon(MailCheckData, 'MailCheck');
export const Maximize = createAppIcon(MaximizeData, 'Maximize');
export const MessageCircle = createAppIcon(MessageCircleData, 'MessageCircle');
export const Moon = createAppIcon(MoonData, 'Moon');
export const Network = createAppIcon(NetworkData, 'Network');
export const Pencil = createAppIcon(PencilData, 'Pencil');
export const Pin = createAppIcon(PinData, 'Pin');
export const PlusCircle = createAppIcon(PlusCircleData, 'PlusCircle');
export const RefreshCw = createAppIcon(RefreshCwData, 'RefreshCw');
export const RotateCcw = createAppIcon(RotateCcwData, 'RotateCcw');
export const Save = createAppIcon(SaveData, 'Save');
export const Send = createAppIcon(SendData, 'Send');
export const Settings = createAppIcon(SettingsData, 'Settings');
export const Settings2 = createAppIcon(Settings2Data, 'Settings2');
export const Share2 = createAppIcon(Share2Data, 'Share2');
export const ShieldCheck = createAppIcon(ShieldCheckData, 'ShieldCheck');
export const SlidersHorizontal = createAppIcon(SlidersHorizontalData, 'SlidersHorizontal');
export const Sparkles = createAppIcon(SparklesData, 'Sparkles');
export const Star = createAppIcon(StarData, 'Star');
export const Sun = createAppIcon(SunData, 'Sun');
export const LayoutTwoColumn = createAppIcon(LayoutTwoColumnData, 'LayoutTwoColumn');
export const LayoutTwoRow = createAppIcon(LayoutTwoRowData, 'LayoutTwoRow');
export const CircleHelp = createAppIcon(CircleHelpData, 'CircleHelp');
export const Table = createAppIcon(TableData, 'Table');
export const Table2 = createAppIcon(Table2Data, 'Table2');
export const TableProperties = createAppIcon(TablePropertiesData, 'TableProperties');
export const Trash2 = createAppIcon(Trash2Data, 'Trash2');
export const Upload = createAppIcon(UploadData, 'Upload');
export const UserRound = createAppIcon(UserRoundData, 'UserRound');
export const WandSparkles = createAppIcon(WandSparklesData, 'WandSparkles');
export const Waypoints = createAppIcon(WaypointsData, 'Waypoints');
export const Zap = createAppIcon(ZapData, 'Zap');
export const ZoomIn = createAppIcon(ZoomInData, 'ZoomIn');
export const ZoomOut = createAppIcon(ZoomOutData, 'ZoomOut');
