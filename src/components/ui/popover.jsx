"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({
  ...props
}) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  asChild,
  children,
  ...props
}) {
  if (asChild) {
    return (
      <PopoverPrimitive.Trigger
        data-slot="popover-trigger"
        render={children}
        {...props}
      />
    );
  }
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverPortal({
  ...props
}) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  children,
  ...props
}) {
  return (
    <PopoverPortal>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-72 origin-(--transform-origin) rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  );
}

export { Popover, PopoverTrigger, PopoverContent }