import { forwardRef } from 'react';
import {
  AlertCircle as AlertCircleData,
  AlertTriangle as AlertTriangleData,
  AlignJustify as AlignJustifyData,
  AlignLeft as AlignLeftData,
  ArrowLeft as ArrowLeftData,
  ArrowRight as ArrowRightData,
  BanIcon as BanData,
  Chart03Icon as BarChart3Data,
  BookOpen as BookOpenData,
  Bot as BotData,
  Calendar as CalendarData,
  Check as CheckData,
  CheckmarkCircle02Icon as CheckCircle2Data,
  ChevronDown as ChevronDownData,
  ChevronLeft as ChevronLeftData,
  ChevronRight as ChevronRightData,
  ChevronUp as ChevronUpData,
  Circle as CircleData,
  Clock as ClockData,
  CloudUpload as CloudUploadData,
  Code as CodeData,
  CodeSimpleIcon as Code2Data,
  Coins as CoinsData,
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
  GripVertical as GripVerticalData,
  HardDrive as HardDriveData,
  Hash as HashData,
  History as HistoryData,
  Info as InfoData,
  InformationCircleIcon as InfoIconData,
  Key as KeyData,
  KeyRound as KeyRoundData,
  Languages as LanguagesData,
  Laptop as LaptopData,
  Layers as LayersData,
  LayoutGrid as LayoutGridData,
  LayoutTemplate as LayoutTemplateData,
  Lightbulb as LightbulbData,
  Link2 as Link2Data,
  ListChecks as ListChecksData,
  ListPlus as ListPlusData,
  ListTree as ListTreeData,
  Loading03Icon as Loader2Data,
  Lock as LockData,
  LogIn as LogInData,
  LogOut as LogOutData,
  Mail as MailData,
  MailCheck as MailCheckData,
  Maximize as MaximizeData,
  MessageCircle as MessageCircleData,
  Minus as MinusData,
  Moon as MoonData,
  MoreHorizontal as MoreHorizontalData,
  Network as NetworkData,
  PanelRightClose as PanelRightCloseData,
  PanelRightOpen as PanelRightOpenData,
  Pause as PauseData,
  Pencil as PencilData,
  Pin as PinData,
  Play as PlayData,
  Plus as PlusData,
  PlusSignCircleIcon as PlusCircleData,
  RefreshCw as RefreshCwData,
  RotateCcw as RotateCcwData,
  Save as SaveData,
  ScrollText as ScrollTextData,
  Search as SearchData,
  SearchCheck as SearchCheckData,
  Send as SendData,
  Settings as SettingsData,
  Settings2 as Settings2Data,
  Share2 as Share2Data,
  ShieldCheck as ShieldCheckData,
  ShieldUser as ShieldUserData,
  SkipBack as SkipBackData,
  SkipForward as SkipForwardData,
  SlidersHorizontal as SlidersHorizontalData,
  Sparkles as SparklesData,
  Star as StarData,
  Sun as SunData,
  Table as TableData,
  Table2 as Table2Data,
  Table03Icon as TablePropertiesData,
  Trash2 as Trash2Data,
  Upload as UploadData,
  User02Icon as User2Data,
  UserRound as UserRoundData,
  WandSparkles as WandSparklesData,
  Route01Icon as WaypointsData,
  WifiOff as WifiOffData,
  Workflow as WorkflowData,
  X as XData,
  Zap as ZapData,
  ZoomIn as ZoomInData,
  ZoomOut as ZoomOutData,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from '@hugeicons/react';

export type AppIconProps = Omit<HugeiconsIconProps, 'altIcon' | 'icon'>;

function createAppIcon(icon: IconSvgElement, displayName: string) {
  const AppIcon = forwardRef<SVGSVGElement, AppIconProps>(
    ({ strokeWidth = 1.7, ...props }, ref) => (
      <HugeiconsIcon ref={ref} icon={icon} strokeWidth={strokeWidth} focusable="false" {...props} />
    ),
  );
  AppIcon.displayName = displayName;
  return AppIcon;
}

export const AlertCircle = createAppIcon(AlertCircleData, 'AlertCircle');
export const AlertTriangle = createAppIcon(AlertTriangleData, 'AlertTriangle');
export const AlignJustify = createAppIcon(AlignJustifyData, 'AlignJustify');
export const AlignLeft = createAppIcon(AlignLeftData, 'AlignLeft');
export const ArrowLeft = createAppIcon(ArrowLeftData, 'ArrowLeft');
export const ArrowRight = createAppIcon(ArrowRightData, 'ArrowRight');
export const Ban = createAppIcon(BanData, 'Ban');
export const BarChart3 = createAppIcon(BarChart3Data, 'BarChart3');
export const BookOpen = createAppIcon(BookOpenData, 'BookOpen');
export const Bot = createAppIcon(BotData, 'Bot');
export const Calendar = createAppIcon(CalendarData, 'Calendar');
export const Check = createAppIcon(CheckData, 'Check');
export const CheckCircle2 = createAppIcon(CheckCircle2Data, 'CheckCircle2');
export const ChevronDown = createAppIcon(ChevronDownData, 'ChevronDown');
export const ChevronLeft = createAppIcon(ChevronLeftData, 'ChevronLeft');
export const ChevronRight = createAppIcon(ChevronRightData, 'ChevronRight');
export const ChevronUp = createAppIcon(ChevronUpData, 'ChevronUp');
export const Circle = createAppIcon(CircleData, 'Circle');
export const Clock = createAppIcon(ClockData, 'Clock');
export const CloudUpload = createAppIcon(CloudUploadData, 'CloudUpload');
export const Code = createAppIcon(CodeData, 'Code');
export const Code2 = createAppIcon(Code2Data, 'Code2');
export const Coins = createAppIcon(CoinsData, 'Coins');
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
export const GripVertical = createAppIcon(GripVerticalData, 'GripVertical');
export const HardDrive = createAppIcon(HardDriveData, 'HardDrive');
export const Hash = createAppIcon(HashData, 'Hash');
export const History = createAppIcon(HistoryData, 'History');
export const Info = createAppIcon(InfoData, 'Info');
export const InfoIcon = createAppIcon(InfoIconData, 'InfoIcon');
export const Key = createAppIcon(KeyData, 'Key');
export const KeyRound = createAppIcon(KeyRoundData, 'KeyRound');
export const Languages = createAppIcon(LanguagesData, 'Languages');
export const Laptop = createAppIcon(LaptopData, 'Laptop');
export const Layers = createAppIcon(LayersData, 'Layers');
export const LayoutGrid = createAppIcon(LayoutGridData, 'LayoutGrid');
export const LayoutTemplate = createAppIcon(LayoutTemplateData, 'LayoutTemplate');
export const Lightbulb = createAppIcon(LightbulbData, 'Lightbulb');
export const Link2 = createAppIcon(Link2Data, 'Link2');
export const ListChecks = createAppIcon(ListChecksData, 'ListChecks');
export const ListPlus = createAppIcon(ListPlusData, 'ListPlus');
export const ListTree = createAppIcon(ListTreeData, 'ListTree');
export const Loader2 = createAppIcon(Loader2Data, 'Loader2');
export const Lock = createAppIcon(LockData, 'Lock');
export const LogIn = createAppIcon(LogInData, 'LogIn');
export const LogOut = createAppIcon(LogOutData, 'LogOut');
export const Mail = createAppIcon(MailData, 'Mail');
export const MailCheck = createAppIcon(MailCheckData, 'MailCheck');
export const Maximize = createAppIcon(MaximizeData, 'Maximize');
export const MessageCircle = createAppIcon(MessageCircleData, 'MessageCircle');
export const Minus = createAppIcon(MinusData, 'Minus');
export const Moon = createAppIcon(MoonData, 'Moon');
export const MoreHorizontal = createAppIcon(MoreHorizontalData, 'MoreHorizontal');
export const Network = createAppIcon(NetworkData, 'Network');
export const PanelRightClose = createAppIcon(PanelRightCloseData, 'PanelRightClose');
export const PanelRightOpen = createAppIcon(PanelRightOpenData, 'PanelRightOpen');
export const Pause = createAppIcon(PauseData, 'Pause');
export const Pencil = createAppIcon(PencilData, 'Pencil');
export const Pin = createAppIcon(PinData, 'Pin');
export const Play = createAppIcon(PlayData, 'Play');
export const Plus = createAppIcon(PlusData, 'Plus');
export const PlusCircle = createAppIcon(PlusCircleData, 'PlusCircle');
export const RefreshCw = createAppIcon(RefreshCwData, 'RefreshCw');
export const RotateCcw = createAppIcon(RotateCcwData, 'RotateCcw');
export const Save = createAppIcon(SaveData, 'Save');
export const ScrollText = createAppIcon(ScrollTextData, 'ScrollText');
export const Search = createAppIcon(SearchData, 'Search');
export const SearchCheck = createAppIcon(SearchCheckData, 'SearchCheck');
export const Send = createAppIcon(SendData, 'Send');
export const Settings = createAppIcon(SettingsData, 'Settings');
export const Settings2 = createAppIcon(Settings2Data, 'Settings2');
export const Share2 = createAppIcon(Share2Data, 'Share2');
export const ShieldCheck = createAppIcon(ShieldCheckData, 'ShieldCheck');
export const ShieldUser = createAppIcon(ShieldUserData, 'ShieldUser');
export const SkipBack = createAppIcon(SkipBackData, 'SkipBack');
export const SkipForward = createAppIcon(SkipForwardData, 'SkipForward');
export const SlidersHorizontal = createAppIcon(SlidersHorizontalData, 'SlidersHorizontal');
export const Sparkles = createAppIcon(SparklesData, 'Sparkles');
export const Star = createAppIcon(StarData, 'Star');
export const Sun = createAppIcon(SunData, 'Sun');
export const Table = createAppIcon(TableData, 'Table');
export const Table2 = createAppIcon(Table2Data, 'Table2');
export const TableProperties = createAppIcon(TablePropertiesData, 'TableProperties');
export const Trash2 = createAppIcon(Trash2Data, 'Trash2');
export const Upload = createAppIcon(UploadData, 'Upload');
export const User2 = createAppIcon(User2Data, 'User2');
export const UserRound = createAppIcon(UserRoundData, 'UserRound');
export const WandSparkles = createAppIcon(WandSparklesData, 'WandSparkles');
export const Waypoints = createAppIcon(WaypointsData, 'Waypoints');
export const WifiOff = createAppIcon(WifiOffData, 'WifiOff');
export const Workflow = createAppIcon(WorkflowData, 'Workflow');
export const X = createAppIcon(XData, 'X');
export const Zap = createAppIcon(ZapData, 'Zap');
export const ZoomIn = createAppIcon(ZoomInData, 'ZoomIn');
export const ZoomOut = createAppIcon(ZoomOutData, 'ZoomOut');
