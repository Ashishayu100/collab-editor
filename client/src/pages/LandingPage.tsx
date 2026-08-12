import {
  Cloud,
  Code2,
  FileText,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from '../hooks/useInView';

interface Feature {
  icon: typeof Zap;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Real-Time Collaboration',
    description: 'See cursors, selections, and typing indicators live as your team edits together.',
  },
  {
    icon: RefreshCw,
    title: 'CRDTs — Conflict-Free',
    description: 'No merge conflicts, ever. Yjs resolves concurrent edits automatically, correctly.',
  },
  {
    icon: Cloud,
    title: 'Offline Editing',
    description: 'Keep working without a connection. Changes sync automatically on reconnect.',
  },
  {
    icon: FileText,
    title: 'Rich Text Editor',
    description: 'A full formatting toolbar, slash commands, and export to PDF, Markdown, or HTML.',
  },
  {
    icon: MessageSquare,
    title: 'Inline Comments',
    description: 'Thread-based discussions anchored to the exact text they refer to.',
  },
  {
    icon: Shield,
    title: 'Access Control',
    description: 'Owner, editor, and viewer roles, plus shareable invite links with granular permissions.',
  },
];

const TECH_BADGES = [
  'Yjs CRDTs',
  'WebSocket Binary Protocol',
  'Redis Pub/Sub',
  'PostgreSQL',
  'React 18',
  'TipTap v3',
  'TypeScript',
];

function FeatureCard({ icon: Icon, title, description }: Feature) {
  const [ref, isVisible] = useInView(0.15);
  return (
    <div
      ref={ref}
      className={`animate-fade-in-up ${isVisible ? 'visible' : ''} rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-md`}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-primary">
        <Icon size={22} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [ref, isVisible] = useInView(0.1);
  return (
    <div ref={ref} className={`animate-fade-in-up ${isVisible ? 'visible' : ''} ${className}`}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-gray-900">CollabEdit</span>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              Sign up →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-4xl px-6 pb-20 pt-20 text-center sm:pt-28">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles size={12} /> Powered by Yjs CRDTs
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          Real-Time Collaborative
          <br />
          Document Editing.
          <br />
          <span className="text-primary">Built for Teams.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-gray-500 sm:text-lg">
          Create, edit, and collaborate on documents in real time with your team. Conflict-free
          editing, offline support, and comments — all in one place.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="w-full rounded-lg bg-primary px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary-dark sm:w-auto"
          >
            Get Started — It&apos;s Free →
          </Link>
          <a
            href="#features"
            className="w-full rounded-lg px-6 py-3 text-center text-sm font-medium text-gray-600 transition-colors duration-150 hover:text-gray-900 sm:w-auto"
          >
            See what&apos;s inside →
          </a>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
        <Section className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Everything you need to write together</h2>
        </Section>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* Tech section */}
      <section className="border-t border-gray-100 bg-gray-50">
        <Section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Built With Modern Infrastructure</h2>
          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {TECH_BADGES.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
              >
                {badge}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-lg text-sm text-gray-500">
            Horizontally scalable across server instances. 80%+ test coverage on critical paths.
            Sub-50ms local edit latency.
          </p>
        </Section>
      </section>

      {/* CTA */}
      <Section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Ready to write together?</h2>
        <p className="mt-3 text-sm text-gray-500">No credit card required. Create your first document in seconds.</p>
        <Link
          to="/signup"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary-dark"
        >
          Get Started — It&apos;s Free →
        </Link>
      </Section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-gray-400 sm:flex-row">
          <span>© {new Date().getFullYear()} CollabEdit. MIT License.</span>
          <span className="flex items-center gap-1.5">
            <Code2 size={13} /> Built with React, TypeScript &amp; Yjs
          </span>
        </div>
      </footer>
    </div>
  );
}
