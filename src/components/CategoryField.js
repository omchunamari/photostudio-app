"use client";

import * as React from "react";
import SearchableSelect from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Plus, X, Check, Undo2, Lock } from "lucide-react";

/**
 * A category picker with management folded into it.
 *
 * Managing categories used to live behind a separate "Manage Categories"
 * button sitting next to "Add Expense" / "Add Deliverable". That put the
 * two halves of one job in two different places: you'd open the Add form,
 * find the category you wanted didn't exist, close it, hunt for the manage
 * button, add the category, then reopen the form and start over.
 *
 * Now the whole thing lives inside the form. Pick a category, or hit the
 * gear to add and remove them without leaving the dialog. A freshly added
 * category is selected automatically, since wanting to use it is the only
 * reason to add one mid-form.
 *
 * Built-in categories can't be removed — they're seeded defaults that other
 * records may already reference — so they show a lock instead of a delete
 * button rather than silently failing when clicked.
 *
 * Props:
 *   value, onValueChange   the selected category
 *   categories             full list, built-ins first
 *   builtIns               subset that cannot be deleted
 *   onAdd(name)            async; resolve to add. Reject to surface an error.
 *   onRemove(name)         async; resolve to delete.
 *   label, id              form field labelling
 */
export default function CategoryField({
  value,
  onValueChange,
  categories = [],
  builtIns = [],
  onAdd,
  onRemove,
  label = "Category",
  id = "category",
  disabled = false,
}) {
  const [managing, setManaging] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removingName, setRemovingName] = React.useState(null);
  const [confirmName, setConfirmName] = React.useState(null);
  const [error, setError] = React.useState("");

  const builtInSet = new Set(builtIns);
  const trimmed = draft.trim();
  const duplicate = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase());

  async function handleAdd(e) {
    e.preventDefault();
    if (!trimmed || duplicate || adding) return;
    setAdding(true);
    setError("");
    try {
      await onAdd(trimmed);
      // Selecting it immediately is the whole point of adding one here.
      onValueChange(trimmed);
      setDraft("");
    } catch (err) {
      setError(err.message || "Couldn't add that category");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(name) {
    setRemovingName(name);
    setError("");
    try {
      await onRemove(name);
      setConfirmName(null);
    } catch (err) {
      setError(err.message || "Couldn't remove that category");
    } finally {
      setRemovingName(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          onClick={() => {
            setManaging((m) => !m);
            setConfirmName(null);
            setError("");
          }}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {managing ? (
            <>
              <Undo2 className="h-3 w-3" /> Done
            </>
          ) : (
            <>
              <Settings2 className="h-3 w-3" /> Edit list
            </>
          )}
        </button>
      </div>

      {!managing ? (
        <SearchableSelect
          value={value}
          onValueChange={onValueChange}
          options={categories}
          placeholder="Select a category..."
          searchPlaceholder="Search categories..."
          emptyText="No matching category — use Edit list to add one"
          disabled={disabled}
          className="mt-1"
        />
      ) : (
        <div className="mt-1 rounded-lg border border-border bg-muted/30 p-2">
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {categories.map((c) => {
              const locked = builtInSet.has(c);
              const confirming = confirmName === c;
              return (
                <div
                  key={c}
                  className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c}
                    {c === value && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">in use</span>
                    )}
                  </span>

                  {locked ? (
                    <span
                      className="shrink-0 text-muted-foreground/50"
                      title="Built-in category — can't be removed"
                    >
                      <Lock className="h-3 w-3" />
                    </span>
                  ) : confirming ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">Remove?</span>
                      <button
                        type="button"
                        onClick={() => handleRemove(c)}
                        disabled={removingName === c}
                        className="rounded p-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        title={`Remove ${c}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmName(null)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                        title="Keep it"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmName(c)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      title={`Remove ${c}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Not a <form> — this renders inside the parent's form, and a
              nested form would submit the outer one on Enter. */}
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd(e);
              }}
              placeholder="New category name..."
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!trimmed || duplicate || adding}
            >
              <Plus className="h-3.5 w-3.5" />
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>

          {duplicate && trimmed && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              &ldquo;{trimmed}&rdquo; already exists.
            </p>
          )}
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}