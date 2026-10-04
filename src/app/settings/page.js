"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RichTextEditor from "@/components/quotes/RichTextEditor";
import { Plus, Trash2, X, CalendarOff, Copy, Lock, ChevronUp, ChevronDown, Eye, Download, Search, Building2, Package, FileText, CalendarClock, ClipboardList, Inbox } from "lucide-react";
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
import { getOrgHolidays, saveOrgHolidays } from "@/lib/firebase/holidays";
import { formatMonthDay, sortByMonthDay } from "@/lib/holidays";
import { blankEvent } from "@/lib/constants/quotations";
import { getEnquiryFormConfig, saveEnquiryFormConfig } from "@/lib/firebase/enquiryForm";
import { getAllEnquiryResponses } from "@/lib/firebase/enquiryResponses";
import { formatDateTime12 } from "@/lib/dateIST";
import {
  DEFAULT_ENQUIRY_FORM,
  ENQUIRY_FIELD_TYPES,
  ENQUIRY_MAPS_TO_OPTIONS,
  LOCKED_FIELD_KEYS,
  slugifyFieldKey,
} from "@/lib/constants/enquiryForm";

const SECTIONS = [
  { value: "org", label: "Business & Payment", desc: "Studio name, tagline and the bank details printed on quotes.", icon: Building2 },
  { value: "packages", label: "Packages", desc: "Reusable packages you can drop into a quote.", icon: Package },
  { value: "contracts", label: "Contracts", desc: "Terms & conditions templates attached to quotes.", icon: FileText },
  { value: "schedules", label: "Payment Schedules", desc: "Instalment splits, e.g. 30 / 60 / 10.", icon: CalendarClock },
  { value: "holidays", label: "Holidays", desc: "Yearly office holidays — not counted as working days.", icon: CalendarOff },
  { value: "enquiryForm", label: "Enquiry Form", desc: "Questions on your public enquiry page.", icon: ClipboardList },
  { value: "enquiryResponses", label: "Responses", desc: "Everything submitted through the enquiry form.", icon: Inbox },
];
const SETTINGS_TABS = SECTIONS.map((x) => x.value);

const PANELS = {
  org: OrgSettingsPanel,
  packages: PackageTemplatesPanel,
  contracts: ContractTemplatesPanel,
  schedules: ScheduleTemplatesPanel,
  holidays: HolidaysPanel,
  enquiryForm: EnquiryFormPanel,
  enquiryResponses: EnquiryResponsesPanel,
};

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Deep links (e.g. Attendance → Settings › Holidays) seed the section; the
  // URL is kept in step so refresh / back land on the same section.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return SETTINGS_TABS.includes(t) ? t : "org";
  });
  const current = SECTIONS.find((x) => x.value === tab) || SECTIONS[0];
  const Panel = PANELS[current.value];

  function choose(value) {
    setTab(value);
    router.replace(`/settings?tab=${value}`, { scroll: false });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-5">
          <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your studio&rsquo;s quote defaults, templates, holidays and enquiry form.</p>
        </div>

        <div className="flex flex-col gap-5 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
          {/* Phone: scrolling pills. Tablet/desktop: a sticky side menu. */}
          <nav
            aria-label="Settings sections"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:sticky md:top-4 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:rounded-xl md:bg-card md:p-2 md:shadow-xs md:ring-1 md:ring-foreground/10 [&::-webkit-scrollbar]:hidden"
          >
            {SECTIONS.map((x) => {
              const active = x.value === current.value;
              return (
                <button
                  key={x.value}
                  type="button"
                  onClick={() => choose(x.value)}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-1.5 text-left text-sm font-medium transition-colors md:rounded-lg md:px-3 md:py-2 ${
                    active
                      ? "bg-primary text-primary-foreground md:bg-muted md:text-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground md:bg-transparent"
                  }`}
                >
                  <x.icon className={`h-4 w-4 shrink-0 ${active ? "md:text-accent" : ""}`} />
                  <span className="whitespace-nowrap">{x.label}</span>
                </button>
              );
            })}
          </nav>

          <section className="min-w-0">
            <div className="mb-1 flex items-start gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex">
                <current.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">{current.label}</h2>
                <p className="text-sm text-muted-foreground">{current.desc}</p>
              </div>
            </div>
            <Panel key={current.value} />
          </section>
        </div>
      </div>
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

  if (loading) return <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/70" />;

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

  if (loading) return <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/70" />;

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
                      className="text-destructive hover:text-destructive/80"
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
                    className="text-destructive hover:text-destructive/80"
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
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No package templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
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
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-white hover:bg-destructive/90">
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

  if (loading) return <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/70" />;

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
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No contract templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
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
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-white hover:bg-destructive/90">
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

  if (loading) return <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/70" />;

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
                    className="text-destructive hover:text-destructive/80"
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
              <p className={`text-sm ${splitsSum === 100 ? "text-success" : "text-warning"}`}>
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
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No payment schedule templates yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
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
                      <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-white hover:bg-destructive/90">
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

function HolidaysPanel() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [monthDay, setMonthDay] = useState("");

  async function load() {
    setLoading(true);
    setHolidays(sortByMonthDay(await getOrgHolidays()));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function persist(next) {
    setSaving(true);
    try {
      const sorted = sortByMonthDay(next);
      await saveOrgHolidays(sorted);
      setHolidays(sorted);
      toast.success("Holidays saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    if (!name.trim() || !monthDay) return;
    // <input type="date"> gives "YYYY-MM-DD" — we only keep the MM-DD part
    // since these holidays recur every year on a fixed calendar date.
    const md = monthDay.slice(5, 10);
    if (holidays.some((h) => h.monthDay === md)) {
      toast.error("A holiday is already set for that date.");
      return;
    }
    const next = [...holidays, { id: crypto.randomUUID(), name: name.trim(), monthDay: md }];
    setName("");
    setMonthDay("");
    persist(next);
  }

  function handleRemove(id) {
    persist(holidays.filter((h) => h.id !== id));
  }

  if (loading) return <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/70" />;

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-6 p-4">
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
            Yearly Fixed Holidays
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            These dates repeat every year (Republic Day, Independence Day, etc.). On a
            holiday — and on Sundays — nobody is required to submit a Daily Report, and
            they won&rsquo;t show up as &ldquo;missing&rdquo; on the admin report view.
          </p>

          <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem] flex-1">
              <Label>Holiday name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Republic Day"
              />
            </div>
            <div>
              <Label>Date (any year)</Label>
              <Input type="date" value={monthDay} onChange={(e) => setMonthDay(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving || !name.trim() || !monthDay}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </form>

          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holidays configured yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-md border border-border">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
                      {formatMonthDay(h.monthDay)}
                    </span>
                    <span className="text-sm text-foreground">{h.name}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => handleRemove(h.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EnquiryFormPanel() {
  const [form, setForm] = useState(DEFAULT_ENQUIRY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  // Raw text for each field's "Options" box, kept separate from
  // field.options (the parsed array). Parsing on every keystroke — split
  // on comma, trim, drop empties — ate the comma and any trailing space
  // the moment you typed them, since the very next render immediately
  // re-joined the now-shorter array and snapped the box back to before
  // what you'd just typed. This lets you type freely; the raw text only
  // gets parsed into field.options on blur.
  const [optionsDraft, setOptionsDraft] = useState({});

  useEffect(() => {
    getEnquiryFormConfig().then((cfg) => {
      setForm(cfg);
      setOptionsDraft(
        Object.fromEntries((cfg.fields || []).map((f) => [f.id, (f.options || []).join(", ")]))
      );
      setLoading(false);
    });
    if (typeof window !== "undefined") {
      setPublicUrl(`${window.location.origin}/enquire`);
    }
  }, []);

  function updateField(id, patch) {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    }));
  }

  function moveField(id, dir) {
    setForm((f) => {
      const idx = f.fields.findIndex((field) => field.id === id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= f.fields.length) return f;
      const fields = [...f.fields];
      [fields[idx], fields[swapWith]] = [fields[swapWith], fields[idx]];
      return { ...f, fields };
    });
  }

  function addField() {
    const existingKeys = form.fields.map((f) => f.key);
    const id = slugifyFieldKey("customField", existingKeys) + Date.now();
    setForm((f) => ({
      ...f,
      fields: [
        ...f.fields,
        {
          id,
          key: slugifyFieldKey("New Question", existingKeys),
          label: "New Question",
          type: "text",
          required: false,
          locked: false,
          mapsTo: "custom",
          options: [],
        },
      ],
    }));
  }

  function removeField(id) {
    const field = form.fields.find((f) => f.id === id);
    if (field?.locked) return;
    setForm((f) => ({ ...f, fields: f.fields.filter((field) => field.id !== id) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Locked fields always stay required, regardless of what got toggled
      // in the UI before saving. Also flushes optionsDraft into
      // field.options — normally blur does this when focus moves to the
      // Save button, but this covers a save triggered before that fires.
      const fields = form.fields.map((f) => {
        const next = f.locked ? { ...f, required: true } : f;
        if (f.type !== "select" || !(f.id in optionsDraft)) return next;
        return {
          ...next,
          options: optionsDraft[f.id].split(",").map((o) => o.trim()).filter(Boolean),
        };
      });
      await saveEnquiryFormConfig({ ...form, fields });
      setForm((f) => ({ ...f, fields }));
      setOptionsDraft(Object.fromEntries(fields.map((f) => [f.id, (f.options || []).join(", ")])));
      toast.success("Enquiry form saved");
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  }

  if (loading) {
    return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Public form link</p>
            <p className="break-all text-xs text-muted-foreground">{publicUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopyLink}>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium shadow-xs hover:bg-muted"
              >
                Preview
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <Label>Form title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              placeholder="You're just a step away from getting us making your day special!"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {form.fields.map((field, idx) => (
          <Card key={field.id}>
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveField(field.id, -1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === form.fields.length - 1}
                    onClick={() => moveField(field.id, 1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1">
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="font-medium"
                  />
                </div>

                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(field.id, { type: v })}
                  disabled={field.locked}
                >
                  <SelectTrigger className="w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENQUIRY_FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {field.locked ? (
                  <span
                    title="Required to create a lead — can't be removed or made optional"
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {field.type === "select" && (
                <div className="ml-8">
                  <Label className="text-xs">Options (comma separated)</Label>
                  <Input
                    value={optionsDraft[field.id] ?? (field.options || []).join(", ")}
                    onChange={(e) =>
                      setOptionsDraft((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    onBlur={(e) =>
                      updateField(field.id, {
                        options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Wedding, Pre-Wedding, Engagement"
                  />
                </div>
              )}

              {!field.locked && (
                <div className="ml-8">
                  <Label className="text-xs">Save this answer to</Label>
                  <Select
                    value={field.mapsTo || "custom"}
                    onValueChange={(v) => updateField(field.id, { mapsTo: v })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENQUIRY_MAPS_TO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {field.mapsTo === "eventDetails"
                      ? "Answers are added to the lead's Notes as-is, without a label."
                      : field.mapsTo && field.mapsTo !== "custom"
                      ? `Answers fill the lead's ${ENQUIRY_MAPS_TO_OPTIONS.find((o) => o.value === field.mapsTo)?.label} field directly.`
                      : "Answers are added to the lead's Notes, labeled with this question."}
                  </p>
                </div>
              )}

              <label className="ml-8 flex w-fit items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={field.locked ? true : field.required}
                  disabled={field.locked}
                  onCheckedChange={(checked) => updateField(field.id, { required: !!checked })}
                />
                Required
                {field.locked && (
                  <span className="text-xs text-muted-foreground">(always required — needed to create a lead)</span>
                )}
              </label>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={addField}>
          <Plus className="h-3.5 w-3.5" /> Add question
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Form"}
        </Button>
      </div>
    </div>
  );
}

function EnquiryResponsesPanel() {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    getAllEnquiryResponses()
      .then(setResponses)
      .finally(() => setLoading(false));
  }, []);

  const filtered = responses.filter((r) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      r.clientName?.toLowerCase().includes(term) ||
      r.phone?.toLowerCase().includes(term)
    );
  });

  function handleExport() {
    const allLabels = [];
    const seen = new Set();
    for (const r of responses) {
      for (const a of r.answers || []) {
        if (!seen.has(a.key)) {
          seen.add(a.key);
          allLabels.push(a);
        }
      }
    }
    const header = ["Submitted", "Name", "Phone", ...allLabels.map((a) => a.label)];
    const rows = responses.map((r) => {
      const byKey = Object.fromEntries((r.answers || []).map((a) => [a.key, a.value]));
      return [
        (r.createdAt || "").slice(0, 16).replace("T", " "),
        r.clientName || "",
        r.phone || "",
        ...allLabels.map((a) => byKey[a.key] || ""),
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enquiry-responses.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every submission of the public enquiry form, exactly as answered — including questions that were later
        changed or removed from the form.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="pl-8"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={!responses.length}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {responses.length === 0 ? "No form submissions yet." : "No responses match your search."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime12(r.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{r.clientName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{r.clientName || "Enquiry response"}</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm text-foreground">{r.phone || "—"}</p>
                          </div>
                          {(r.answers || []).map((a) => (
                            <div key={a.key}>
                              <p className="text-xs text-muted-foreground">{a.label}</p>
                              <p className="whitespace-pre-wrap text-sm text-foreground">{a.value || "—"}</p>
                            </div>
                          ))}
                          {r.leadId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-1 w-fit"
                              onClick={() => router.push(`/leads/${r.leadId}`)}
                            >
                              View lead
                            </Button>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <Suspense fallback={null}>
          <SettingsContent />
        </Suspense>
      </DeviceGate>
    </ProtectedRoute>
  );
}