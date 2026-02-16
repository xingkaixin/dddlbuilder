import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="top-center"
      closeButton
      toastOptions={{
        duration: 3000,
        classNames: {
          toast:
            'group toast !bg-primary/5 !text-foreground !border !border-border !border-l-4 !border-l-primary !shadow-lg !rounded-lg !p-4',
          title: '!text-sm !font-semibold',
          description: '!text-sm !text-muted-foreground',
          actionButton:
            '!bg-primary !text-primary-foreground hover:!bg-primary/90 !text-xs !px-3 !py-1.5 !rounded-md !font-medium',
          cancelButton:
            '!bg-muted !text-muted-foreground hover:!bg-muted/80 !text-xs !px-3 !py-1.5 !rounded-md !font-medium',
          closeButton:
            '!text-muted-foreground hover:!text-foreground !opacity-0 group-hover:!opacity-100 !transition-opacity',
          success:
            '!border-l-emerald-500 !bg-emerald-50/50 dark:!bg-emerald-950/20',
          error: '!border-l-destructive !bg-red-50/50 dark:!bg-red-950/20',
          warning: '!border-l-amber-500 !bg-amber-50/50 dark:!bg-amber-950/20',
          info: '!border-l-primary !bg-primary/5',
          loader: '!text-primary',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
