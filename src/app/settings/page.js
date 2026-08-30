"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleEl,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import RichTextEditor from "@/components/quotes/RichTextEditor";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  getOrgQuoteSettings,
  saveOrgQuoteSettings,
  getPackageTemplates,
  createPackageTemplate,
  updatePackageTemplate,
  deletePackageTemplate,
  getContractTemplates,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
  getPaymentScheduleTemplates,
  createPaymentScheduleTemplate,
  updatePaymentScheduleTemplate,
  deletePaymentScheduleTemplate,
} from "@/lib/firebase/quoteSettings";
import { blankEvent } from "@/lib/constants/quotations";

function SettingsContent() {
  return (
    <AppShell>
      <h2 className="mb-1 font-serif text-2xl font-semibold text-foreground">Settings</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Your studio&rsquo;s quote defaults and reusable templates.
      </p>

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Business &amp; Payment</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="schedules">Payment Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="org">
          <OrgSettingsPanel />
        </TabsContent>
        <TabsContent value="packages">
          <PackageTemplatesPanel />
        </TabsContent>
        <TabsContent value="contracts">
          <ContractTemplatesPanel />
        </TabsContent>
        <TabsContent value="schedules">
          <ScheduleTemplatesPanel />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function OrgSettingsPanel() {
  const [form, setForm] = useState({
    businessName: "",
    tagline: "",
    accountName: "",
    bank: "",
    accountNumber: "",
    ifsc: "",
    upi: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOrgQuoteSettings().then((s) => {
      setForm({
        businessName: s.businessName || "",
        tagline: s.tagline || "",
        accountName: s.paymentDetails?.accountName || "",
        bank: s.paymentDetails?.bank || "",
        accountNumber: s.paymentDetails?.accountNumber || "",
        ifsc: s.paymentDetails?.ifsc || "",
        upi: s.paymentDetails?.upi || "",
      });
      setLoading(false);
    });
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveOrgQuoteSettings(form);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-6 p-4">
        <div>
          <h3 className="mb-3 text-base font-medium text-foreground">Business Profile</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Business name</Label>
              <Input
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
                placeholder="Your Studio"
              />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input
                value={form.tagline}
                onChange={(e) => update("tagline", e.target.value)}
                placeholder="Wedding Photography & Films"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-base font-medium text-foreground">Default Payment Details</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Shown on every quote unless overridden for that specific quote.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Account name</Label>
              <Input value={form.accountName} onChange={(e) => update("accountName", e.target.value)} />
            </div>
            <div>
              <Label>Bank</Label>
              <Input value={form.bank} onChange={(e) => update("bank", e.target.value)} />
            </div>
            <div>
              <Label>Account number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value)}
              />
            </div>
            <div>
              <Label>IFSC</Label>
              <Input value={form.ifsc} onChange={(e) => update("ifsc", e.target.value)} />
            </div>
            <div>
              <Label>UPI ID</Label>
              <Input value={form.upi} onChange={(e) => update("upi", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PackageTemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // template being edited, or {} for new

  async function load() {
    setLoading(true);
    setTemplates(await getPackageTemplates());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing({
      name: "",
      events: [{ ...blankEvent() }],
      descriptionHtml: "",
      deliverables: [""],
      addonsHtml: "",
      unitPrice: 0,
    });
  }

  async function handleSave() {
    try {
      if (editing.id) {
        await updatePackageTemplate(editing.id, editing);
        toast.success("Package updated");
      } else {
        await createPackageTemplate(editing);
        toast.success("Package created");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    await deletePackageTemplate(id);
    toast.success("Package deleted");
    load();
  }

  if (loading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  if (editing) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 p-4">
          <div>
            <Label>Package name</Label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>

          <div>
            <Label>Default events</Label>
            <div className="flex flex-col gap-2">
              {editing.events.map((ev, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Event name"
                    value={ev.name}
                    onChange={(e) => {
                      const events = [...editing.events];
                      events[idx] = { ...ev, name: e.target.value };
                      setEditing({ ...editing, events });
                    }}
                  />
                  <Input
                    placeholder="Team size"
                    value={ev.teamSize}
                    onChange={(e) => {
                      const events = [...editing.events];
                      events[idx] = { ...ev, teamSize: e.target.value };
                      setEditing({ ...editing, events });
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="Shift"
                      value={ev.shift}
                      onChange={(e) => {
                        const events = [...editing.events];
                        events[idx] = { ...ev, shift: e.target.value };
                        setEditing({ ...editing, events });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ ...editing, events: editing.events.filter((_, i) => i !== idx) })
                      }
                      className="text-red-500 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="w-fit text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setEditing({ ...editing, events: [...editing.events, blankEvent()] })}
              >
                + Add event
              </button>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <RichTextEditor
              value={editing.descriptionHtml}
              onChange={(html) => setEditing({ ...editing, descriptionHtml: html })}
            />
          </div>

          <div>
            <Label>Deliverables</Label>
            <div className="flex flex-col gap-2">
              {editing.deliverables.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={d}
                    onChange={(e) => {
                      const deliverables = [...editing.deliverables];
                      deliverables[idx] = e.target.value;
                      setEditing({ ...editing, deliverables });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        deliverables: editing.deliverables.filter((_, i) => i !== idx),
                      })
                    }
                    className="text-red-500 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-fit text-sm text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setEditing({ ...editing, deliverables: [...editing.deliverables, ""] })
                }
              >
                + Add deliverable
              </button>
            </div>
          </div>

          <div>
            <Label>Add-ons / Bonuses</Label>
            <RichTextEditor
              value={editing.addonsHtml}
              onChange={(html) => setEditing({ ...editing, addonsHtml: html })}
            />
          </div>

          <div>
            <Label>Default unit price (₹)</Label>
            <Input
              type="number"
              className="w-40"
              value={editing.unitPrice}
              onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Package</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> New Package
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No package templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">₹{Number(t.unitPrice || 0).toLocaleString("en-IN")}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitleEl>Delete {t.name}?</AlertDialogTitleEl>
                      <AlertDialogDescription>
                        Quotes already built from this package keep their own copy — this only removes it from the dropdown.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-red-600 hover:bg-red-700">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractTemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    setTemplates(await getContractTemplates());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    try {
      if (editing.id) {
        await updateContractTemplate(editing.id, editing);
        toast.success("Contract updated");
      } else {
        await createContractTemplate(editing);
        toast.success("Contract created");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    await deleteContractTemplate(id);
    toast.success("Contract deleted");
    load();
  }

  if (loading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  if (editing) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 p-4">
          <div>
            <Label>Template name</Label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <Label>Contract text</Label>
            <RichTextEditor
              value={editing.bodyHtml}
              onChange={(html) => setEditing({ ...editing, bodyHtml: html })}
              minHeight={220}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Contract</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ name: "", bodyHtml: "" })}>
          <Plus className="h-3.5 w-3.5" /> New Contract
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No contract templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <p className="font-medium text-foreground">{t.name}</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitleEl>Delete {t.name}?</AlertDialogTitleEl>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-red-600 hover:bg-red-700">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleTemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { name, splits: [30,60,10] }

  async function load() {
    setLoading(true);
    setTemplates(await getPaymentScheduleTemplates());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const splitsSum = (editing?.splits || []).reduce((s, v) => s + (Number(v) || 0), 0);

  async function handleSave() {
    if (splitsSum !== 100) {
      toast.error("Splits must add up to 100%");
      return;
    }
    try {
      const payload = { name: editing.name, splits: editing.splits.map((v) => Number(v) || 0) };
      if (editing.id) {
        await updatePaymentScheduleTemplate(editing.id, payload);
        toast.success("Schedule updated");
      } else {
        await createPaymentScheduleTemplate(payload);
        toast.success("Schedule created");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    await deletePaymentScheduleTemplate(id);
    toast.success("Schedule deleted");
    load();
  }

  if (loading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  if (editing) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 p-4">
          <div>
            <Label>Schedule name</Label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="30% + 60% + 10%"
            />
          </div>
          <div>
            <Label>Splits (%)</Label>
            <div className="flex flex-col gap-2">
              {editing.splits.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-28"
                    value={v}
                    onChange={(e) => {
                      const splits = [...editing.splits];
                      splits[idx] = e.target.value;
                      setEditing({ ...editing, splits });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({ ...editing, splits: editing.splits.filter((_, i) => i !== idx) })
                    }
                    className="text-red-500 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-fit text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setEditing({ ...editing, splits: [...editing.splits, 0] })}
              >
                + Add installment
              </button>
              <p className={`text-sm ${splitsSum === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                Total {splitsSum}%
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Schedule</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ name: "", splits: [50, 50] })}>
          <Plus className="h-3.5 w-3.5" /> New Schedule
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No payment schedule templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{(t.splits || []).join("% + ")}%</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitleEl>Delete {t.name}?</AlertDialogTitleEl>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-red-600 hover:bg-red-700">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <SettingsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}