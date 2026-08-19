// Server component: route segment config is only honored outside "use client".
// page.tsx is a client component, so its own `export const dynamic` is ignored.
// Without this, the route is statically prerendered and client-side
// router.replace() calls that only change search params are dropped.
export const dynamic = "force-dynamic";

export default function OrganizationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
