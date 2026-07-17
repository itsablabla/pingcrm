import type { ReactNode } from "react";
import { DOCS_URL } from "./constants";

export type Feature = { icon: ReactNode; title: string; description: string };

export const FEATURES: Feature[] = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Multi-Platform Sync",
    description:
      "Connect Gmail, Telegram, Twitter/X, and LinkedIn. Every conversation, every DM, every thread — unified into one timeline per contact.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" />
      </svg>
    ),
    title: "AI Follow-Up Drafts",
    description:
      "Claude writes contextual messages based on your history. One click to edit, one click to send. No more staring at blank compose windows.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: "Relationship Scoring",
    description:
      "A transparent 0–10 score decomposed into reciprocity, recency, frequency, and breadth. See exactly why a relationship is cooling off.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Unified Timeline",
    description:
      "Every touchpoint with a contact — emails, DMs, group chats, mentions — in chronological order. Full context at a glance.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: "Identity Resolution",
    description:
      "Automatically merges alex@startup.com, @alexbuilds on Twitter, Alex R. on LinkedIn, and @alexr on Telegram into one unified profile.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
    title: "Weekly Digest",
    description:
      "Every week: 3–5 people worth reaching out to, and why. Bio changes, job moves, long silences — nothing slips through. Need more? Ask Ping to surface additional contacts anytime.",
  },
];

export type Step = { number: string; label: string; description: string; visual: ReactNode };

export const STEPS: Step[] = [
  {
    number: "01",
    label: "Connect",
    description: "Link your Gmail, Telegram, Twitter, and LinkedIn accounts. Import contacts via CSV or Google Contacts.",
    visual: (
      <div className="flex gap-3 items-center justify-center">
        {["Gmail", "Telegram", "Twitter", "LinkedIn"].map((p) => (
          <span
            key={p}
            className="px-3 py-1.5 rounded text-xs tracking-wider"
            style={{
              fontFamily: "'Space Mono', monospace",
              background: "var(--accent-glow)",
              border: "1px solid var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            {p}
          </span>
        ))}
      </div>
    ),
  },
  {
    number: "02",
    label: "Monitor",
    description: "Ping organizes your conversations, surfaces patterns, and flags when relationships need attention.",
    visual: (
      <div className="flex items-end gap-1 justify-center h-10">
        {[3, 7, 5, 2, 6, 8, 4].map((h, i) => (
          <div
            key={i}
            className="w-3 rounded-sm"
            style={{
              height: `${h * 4}px`,
              background: "linear-gradient(to top, var(--accent-dim), var(--accent))",
              opacity: 0.4 + (h / 8) * 0.6,
            }}
          />
        ))}
      </div>
    ),
  },
  {
    number: "03",
    label: "Act",
    description: "Get a weekly digest with AI-drafted messages. Review, tweak, and send — staying in touch without the mental overhead.",
    visual: (
      <div
        className="px-4 py-2 rounded text-xs text-center"
        style={{
          fontFamily: "'Space Mono', monospace",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-bright)",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ color: "var(--accent)" }}>AI:</span>{" "}
        &quot;Hey Alex, saw you just raised...&quot;
      </div>
    ),
  },
];

// Answer-first FAQ — each answer leads with a direct, extractable sentence so
// search + AI answer engines can quote it. Maps to priority target queries.
// The same array feeds the FAQPage JSON-LD in faq-section (keep them in sync).
export type Faq = { q: string; a: string; doc: { href: string; label: string } | null };

export const FAQS: Faq[] = [
  {
    q: "What is PingCRM?",
    a: "PingCRM is an open-source personal networking CRM. It syncs your conversations across Gmail, Telegram, Twitter/X, and LinkedIn into one timeline per contact, scores each relationship, and uses Claude AI to draft follow-up messages so you stay in touch without the mental overhead.",
    doc: { href: `${DOCS_URL}/architecture/`, label: "How PingCRM works" },
  },
  {
    q: "Is PingCRM open source and self-hostable?",
    a: "Yes. PingCRM is fully open source under the AGPL-3.0 license and self-hostable on your own server. You can deploy it in under 10 minutes with Docker Compose, audit every line of code, and own your relationship data completely — no vendor lock-in and no data harvesting.",
    doc: { href: `${DOCS_URL}/setup/`, label: "Self-hosting setup guide" },
  },
  {
    q: "Which platforms does PingCRM sync?",
    a: "PingCRM syncs Gmail, Telegram, Twitter/X, and LinkedIn. Every email, DM, group chat, and mention is unified into a single chronological timeline for each contact.",
    doc: { href: `${DOCS_URL}/features/gmail/`, label: "Integration docs" },
  },
  {
    q: "How does PingCRM use AI?",
    a: "PingCRM uses Claude AI to draft contextual follow-up messages based on your conversation history. It only drafts — nothing is ever sent automatically. You review, edit, and send each message yourself.",
    doc: { href: `${DOCS_URL}/features/suggestions/`, label: "AI suggestions & composer" },
  },
  {
    q: "What is relationship scoring?",
    a: "Relationship scoring is a transparent 0–10 score for each contact, decomposed into reciprocity, recency, frequency, and breadth. It shows exactly why a relationship is cooling off so you know who needs attention.",
    doc: { href: `${DOCS_URL}/features/suggestions/`, label: "Scoring & suggestions" },
  },
  {
    q: "Is my data private with PingCRM?",
    a: "Yes. Because PingCRM is self-hosted, your data lives on your own infrastructure. Nothing is sent to a third-party CRM cloud, and the AGPL-3.0 license keeps the whole stack auditable.",
    doc: { href: `${DOCS_URL}/architecture/`, label: "Architecture & data flow" },
  },
  {
    q: "Is there a hosted version of PingCRM?",
    a: "A managed, hosted version of PingCRM is in the works. If you'd prefer not to self-host, you can join the waitlist from the homepage.",
    doc: null,
  },
];
