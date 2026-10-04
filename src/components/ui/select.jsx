"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon, Search } from "lucide-react"

// Tracks open/closed so the search box can clear and take focus on every open
// (the popup stays mounted between opens). Forwards everything to the real Root.
const SelectOpenContext = React.createContext(false)

function Select({ onOpenChange, open: openProp, defaultOpen, ...props }) {
  const [openState, setOpenState] = React.useState(defaultOpen ?? false)
  const open = openProp ?? openState
  return (
    <SelectOpenContext.Provider value={open}>
      <SelectPrimitive.Root
        {...props}
        {...(openProp !== undefined ? { open: openProp } : {})}
        defaultOpen={defaultOpen}
        onOpenChange={(next, details) => {
          setOpenState(next)
          onOpenChange?.(next, details)
        }}
      />
    </SelectOpenContext.Provider>
  )
}

/*
 * Type-to-search for every dropdown in the app.
 *
 * SelectContent renders a search box above the options and shares the typed
 * text through this context; each SelectItem hides itself when its text (and
 * value) doesn't contain it. Existing <Select> call sites need no changes.
 * Pass searchable={false} to SelectContent to turn the box off for one menu.
 */
const SelectSearchContext = React.createContext("")

// Plain text of an item's children, so "Wedding" or <>Wedding <b>(3)</b></> both match.
function textOf(node) {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  if (React.isValidElement(node)) return textOf(node.props.children)
  return ""
}

function itemMatches(props, term) {
  if (!term) return true
  const hay = `${textOf(props.children)} ${props.value ?? ""}`.toLowerCase()
  return hay.includes(term)
}

// Counts how many SelectItems in a children tree match, for the "No matches" line.
function countMatches(children, term) {
  let n = 0
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === SelectItem) {
      if (itemMatches(child.props, term)) n++
    } else if (child.props?.children) {
      n += countMatches(child.props.children, term)
    }
  })
  return n
}

function SearchableList({ children }) {
  const open = React.useContext(SelectOpenContext)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef(null)
  const term = query.trim().toLowerCase()

  React.useEffect(() => {
    if (!open) return
    // Every open starts with an empty search. The select also moves focus to the
    // highlighted option as it opens, so take focus back for typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("")
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const matches = term ? countMatches(children, term) : 1

  return (
    <SelectSearchContext.Provider value={term}>
      <div className="sticky top-0 z-20 border-b border-border bg-popover p-1.5">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Let arrows / Enter / Escape / Tab reach the select for keyboard navigation;
          // everything else is typing and must not trigger the select's own typeahead.
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) e.stopPropagation()
          }}
          placeholder="Type to search..."
          aria-label="Search options"
          className="h-8 w-full rounded-sm bg-transparent pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <SelectPrimitive.List>{children}</SelectPrimitive.List>
      {matches === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>}
    </SelectSearchContext.Provider>
  )
}

function SelectGroup({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props} />
  );
}

function SelectValue({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props} />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        } />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = false,
  searchable = true,
  ...props
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}>
          {searchable ? (
            <SearchableList>{children}</SearchableList>
          ) : (
            <>
              <SelectScrollUpButton />
              <SelectPrimitive.List>{children}</SelectPrimitive.List>
              <SelectScrollDownButton />
            </>
          )}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props} />
  );
}

function SelectItem({
  className,
  children,
  ...props
}) {
  const term = React.useContext(SelectSearchContext)
  if (!itemMatches({ children, value: props.value }, term)) return null
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}>
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span
            className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }>
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props} />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
