"use client";

import { useShell } from "@/components/shell/ShellContext";

// Study Settings — placeholder. Reached after creating a new (empty) study;
// only Admin can configure it. The full configuration flow (sites/hierarchy,
// eCRF templates, roles, randomization) is not built yet.
export default function StudySettingsPage() {
  const { study } = useShell();

  return (
    <div style={{ padding: "var(--space-8)", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-2)" }}>
        Study settings
      </div>
      <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--weight-medium)", color: "var(--color-text-primary)", marginBottom: "var(--space-2)" }}>
        {study.name}
      </h1>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-6)" }}>
        {study.code}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-3)",
          textAlign: "center",
          padding: "var(--space-8)",
          background: "var(--color-surface)",
          border: "1px dashed var(--color-border)",
          borderRadius: "var(--radius-lg)",
          color: "var(--color-text-tertiary)",
        }}
      >
        <i className="ti ti-settings" style={{ fontSize: "32px", color: "var(--color-text-placeholder)" }} aria-hidden="true"></i>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-medium)", color: "var(--color-text-secondary)" }}>
          Study configuration coming soon
        </div>
        <div style={{ fontSize: "var(--text-sm)", maxWidth: 440, lineHeight: 1.5 }}>
          This study is empty — no sites, barns, pens, or subjects yet. From here an
          <strong> Admin</strong> will set up the site hierarchy, eCRF form templates,
          roles, and randomization before data entry begins.
        </div>
      </div>
    </div>
  );
}
