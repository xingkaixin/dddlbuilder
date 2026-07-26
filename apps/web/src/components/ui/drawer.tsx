import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';

function Drawer(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

type DrawerCloseProps = DialogPrimitive.Close.Props & { asChild?: boolean };

function DrawerClose({ asChild, children, ...props }: DrawerCloseProps) {
  return (
    <DialogPrimitive.Close
      data-slot="drawer-close"
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  );
}

function DrawerTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function DrawerOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn('t-base-overlay fixed inset-0 z-50 bg-black/60', className)}
      {...props}
    />
  );
}

function DrawerContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DialogPrimitive.Popup
        data-slot="drawer-popup"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[90vw] max-w-sm flex-col border bg-background shadow-lg outline-none transition-transform duration-300 data-ending-style:pointer-events-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DrawerPortal>
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
};
