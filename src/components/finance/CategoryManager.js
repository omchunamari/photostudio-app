"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveFinanceCategories } from "@/lib/firebase/finance";

const GROUPS = [
  { key: "project", label: "Project expense categories" },
  { key: "company", label: "Company expense categories" },
  { key: "income", label: "Income categories" },
];

/** Admin editor for the three category lists. Renaming affects new entries only; existing rows keep their old label. */
export default function CategoryManager({ open, onOpenChange, cats, onSaved }) {
  const [draft, setDraft] = useState(cats);
  const [adding, setAdding] = useState({ project: "", company: "", income: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(cats);
  }, [open, cats]);

  function edit(group, idx, value) {
    setDraft((d) => ({ ...d, [group]: d[group].map((c, i) => (i === idx ? value : c)) }));
  }
  function remove(group, idx) {
    setDraft((d) => ({ ...d, [group]: d[group].filter((_, i) => i !== idx) }));
  }
  function add(group) {
    const v = adding[group].trim();
    if (!v) return;
    if (draft[group].some((c) => c.toLowerCase() === v.toLowerCase())) return toast.error("Category already exists");
    setDraft((d) => ({ ...d, [group]: [...d[group], v] }));
    setAdding((a) => ({ ...a, [group]: "" }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveFinanceCategories(draft);
      toast.success("Categories saved");
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast.error(err.message || "Could not save categories");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-2 text-sm font-medium text-slate-800">{g.label}</p>
              <div className="flex flex-col gap-1.5">
                {draft[g.key].map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={c} onChange={(e) => edit(g.key, i, e.target.value)} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(g.key, i)} aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={adding[g.key]}
                    placeholder="New category"
                    onChange={(e) => setAdding((a) => ({ ...a, [g.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add(g.key))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => add(g.key)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Salary, Loan EMI and Advance are system categories and always exist. Renaming a category only affects new
            entries; old transactions keep the name they were saved with.
          </p>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save categories"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
