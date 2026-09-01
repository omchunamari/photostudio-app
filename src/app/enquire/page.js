"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getEnquiryFormConfig } from "@/lib/firebase/enquiryForm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";

// A thin strip of evenly-spaced perforations — a small nod to film sprocket
// holes, in keeping with "The Rolling Stories" name. Pure CSS, no assets.
function FilmStrip({ tone = "dark" }) {
  const hole = tone === "dark" ? "rgba(250,248,244,0.4)" : "rgba(28,27,25,0.14)";
  return (
    <div
      className="h-[5px] w-full"
      style={{
        backgroundImage: `repeating-linear-gradient(to right, ${hole} 0, ${hole} 4px, transparent 4px, transparent 15px)`,
      }}
      aria-hidden="true"
    />
  );
}

// Slow scrolling marquee band — the "rolling" part of the theme. Pure CSS
// keyframe animation defined inline so this stays a single file.
function RollingBand() {
  const words = ["Weddings", "Films", "Pre-Wedding", "Portraits", "Events", "Stories"];
  const line = [...words, ...words, ...words];
  return (
    <div className="overflow-hidden bg-[var(--accent)] py-1.5">
      <style>{`
        @keyframes trs-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-33.333%); }
        }
        .trs-marquee-track {
          animation: trs-marquee 48s linear infinite;
        }
      `}</style>
      <div className="trs-marquee-track flex w-max items-center gap-2.5 whitespace-nowrap">
        {line.map((w, i) => (
          <span key={i} className="flex items-center gap-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--accent-foreground)] uppercase">
            {w}
            <span className="text-[var(--accent-foreground)]/50">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  const id = `field-${field.key}`;
  if (field.type === "textarea") {
    return (
      <Textarea
        id={id}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your answer"
        className="resize-none px-3.5 py-3 text-[15px]"
      />
    );
  }
  if (field.type === "select") {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-full px-3.5 text-[15px]">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const inputType =
    field.type === "date" ? "date" : field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
  return (
    <Input
      id={id}
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.type === "date" ? undefined : "Your answer"}
      className="h-11 px-3.5 text-[15px]"
    />
  );
}

export default function PublicEnquiryFormPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getEnquiryFormConfig().then((cfg) => {
      setConfig(cfg);
      document.title = `${cfg.title || "Enquiry Form"} · The Rolling Stories`;
      setLoading(false);
    });
  }, []);

  function update(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const missing = (config.fields || []).filter(
      (f) => f.required && !String(values[f.key] || "").trim()
    );
    if (missing.length) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads/public-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, hp: values._hp || "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--background)]">
        <div className="bg-[var(--primary)]">
          <div className="flex flex-col items-center gap-2 px-6 py-5">
            <div className="aperture-ring rounded-full">
              <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 object-contain invert" />
            </div>
          </div>
          <FilmStrip tone="dark" />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-sm text-center">
            <div className="aperture-ring mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full">
              <CheckCircle2 className="h-7 w-7 text-[var(--success)]" strokeWidth={1.75} />
            </div>
            <h1 className="mb-2.5 font-heading text-2xl font-semibold italic text-[var(--foreground)]">
              Thank you
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Your story starts here. We&rsquo;ve received your enquiry and will reach out soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Hero */}
      <div className="bg-[var(--primary)]">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-2 px-6 py-5 text-center sm:py-6">
          <div className="aperture-ring mb-0.5 rounded-full">
            <Image
              src="/logo-mark.png"
              alt="The Rolling Stories"
              width={28}
              height={28}
              className="h-7 w-7 object-contain invert"
              priority
            />
          </div>
          <h1 className="font-heading text-2xl font-semibold italic text-[var(--primary-foreground)] sm:text-[28px]">
            {config.title}
          </h1>
          {config.subtitle && (
            <p className="max-w-xs text-[13px] leading-relaxed text-[var(--primary-foreground)]/60">
              {config.subtitle}
            </p>
          )}
        </div>
        <FilmStrip tone="dark" />
      </div>
      <RollingBand />

      {/* Form */}
      <div className="px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-7 shadow-sm sm:px-9 sm:py-10">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Honeypot — hidden from real visitors, invisible to screen readers */}
              <input
                type="text"
                name="_hp"
                value={values._hp || ""}
                onChange={(e) => update("_hp", e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              {(config.fields || []).map((field) => (
                <div key={field.id} className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`field-${field.key}`}
                    className="text-[13.5px] font-medium text-[var(--foreground)]"
                  >
                    {field.label}
                    {field.required && <span className="text-[var(--accent)]">*</span>}
                  </Label>
                  <FieldInput
                    field={field}
                    value={values[field.key] || ""}
                    onChange={(v) => update(field.key, v)}
                  />
                </div>
              ))}

              {error && (
                <p className="border-l-2 border-[var(--destructive)] pl-3 text-[13px] leading-relaxed text-[var(--destructive)]">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                size="lg"
                className="mt-1 h-11 w-full bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting
                  </span>
                ) : (
                  "Submit enquiry"
                )}
              </Button>

              <p className="text-center text-[11.5px] text-[var(--muted-foreground)]">
                Fields marked <span className="text-[var(--accent)]">*</span> are required
              </p>
            </form>
          </div>

          <p className="mt-8 text-center text-[11px] tracking-[0.14em] text-[var(--muted-foreground)]">
            The Rolling Stories
          </p>
        </div>
      </div>
    </div>
  );
}