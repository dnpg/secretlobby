import { useState, useEffect, useRef } from "react";
import { NavLink, Form, Outlet, useLoaderData, redirect, Link } from "react-router";
import type { Route } from "./+types/_layout";
import { getSession, requireUserAuth, isAdmin, isStaffOwner } from "@secretlobby/auth";
import { ColorModeToggle, cn } from "@secretlobby/ui";

const SIDEBAR_COOKIE = "superadmin_sidebar";

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 572.4 572.4" className={className} aria-label="Secret Lobby">
      <circle cx="286.2" cy="286.2" r="226" fill="currentColor" className="text-[#ed1b2f]" stroke="#231f20" strokeMiterlimit="10" strokeWidth="15.6" />
      <g fill="#231f20">
        <path d="M172.2,264l-2.9-3.5c-.9-1.1-.9-2.5.2-3.3,4.8-3.1,8.5-5.5,10.6-12.4,1.9-6.2-.6-11.3-5.2-12.7-5.4-1.7-10.2,1.9-16.6,9.6-6.7,7.9-13.7,13.6-24,10.4-7-2.2-14.9-10.5-10.4-24.7,2.8-8.9,9.5-14.2,10.4-14.9.7-.6,2.1-.9,3.2.4l2.7,3.3c.9,1.1,1.1,2.4,0,3.4-3.3,2.8-6.6,5.5-8.2,10.7-2.3,7.5,1.6,11.6,4.9,12.6,5.1,1.6,9.5-1.4,14.8-7.8,7.4-9.1,15.1-16.4,26-13,9.3,2.9,14.3,13.6,10.7,25.2-3.4,10.9-11.3,16-13.1,17-1,.6-1.8,1.1-3-.4Z" />
        <path d="M155.3,172.4c-.7-.7-.7-1.8,0-2.5l26.6-26.4c.7-.7,1.9-.7,2.5,0l3.7,3.7c.7.7.7,1.8,0,2.5l-21,20.8,13.5,13.6,17.8-17.6c.7-.7,1.9-.7,2.5,0l3.7,3.7c.7.7.7,1.9,0,2.5l-17.8,17.6,14.2,14.3,21-20.8c.7-.7,1.9-.7,2.5,0l3.6,3.7c.7.7.7,1.8,0,2.5l-26.6,26.4c-.7.7-1.9.7-2.5,0l-43.6-44Z" />
        <path d="M247.3,112.6c9.1-2.5,16.6-1.2,24.2,2.5,1,.5,1.3,1.6.8,2.5l-2.9,5.1c-.4,1-1.2,1.2-2.3.6-5.2-2.6-11.7-3.4-17.3-1.8-12.9,3.5-19.8,17-16.4,29.6,3.4,12.7,16.2,20.8,29.1,17.3,6.6-1.8,10.5-5.6,14-10.2.6-.9,1.5-1,2.1-.7l5.3,3c.9.4,1,1.7.6,2.5-4.5,7.6-11.6,12.5-19.6,14.7-18.1,4.9-36.5-5.6-41.4-23.7-4.9-18.1,5.8-36.6,23.9-41.4Z" />
        <path d="M310.5,111.2c.3-.9,1.2-1.5,2.2-1.2l24.5,6.9c10.8,3.1,17.2,14.1,14.2,24.8-2.3,8.3-9.8,13.6-18.5,14.5l5.9,26.4c.3,1.4-.7,2.6-2.3,2.2l-6.8-1.9c-1-.3-1.4-.9-1.6-1.7l-5.2-26.9-13.6-3.8-6.5,23c-.3.9-1.3,1.5-2.2,1.2l-5.9-1.7c-1-.3-1.5-1.3-1.2-2.2l16.8-59.7ZM327.8,147.3c5.9,1.7,12.4-1.9,14.2-8.1,1.7-5.9-2.1-12.2-8-13.8l-16-4.5-6.2,21.9,16,4.5Z" />
        <path d="M392,147.2c.7-.7,1.8-.7,2.5,0l26.4,26.6c.7.7.7,1.9,0,2.5l-3.7,3.7c-.7.7-1.8.7-2.5,0l-20.9-21-13.6,13.5,17.6,17.7c.7.7.7,1.9,0,2.5l-3.7,3.7c-.7.7-1.9.7-2.5,0l-17.6-17.7-14.3,14.2,20.9,21c.7.7.7,1.9,0,2.5l-3.7,3.6c-.7.7-1.8.7-2.5,0l-26.4-26.6c-.7-.7-.7-1.9,0-2.5l44-43.7Z" />
        <path d="M438.1,226.4l-4.5-14.6c-.3-1,.3-1.9,1.2-2.2l5-1.5c.9-.3,1.9.2,2.2,1.2l11.8,38.5c.3,1-.3,1.9-1.2,2.2l-5,1.5c-.9.3-1.9-.2-2.2-1.2l-4.5-14.6-52.5,16.2c-.9.3-1.9-.3-2.2-1.2l-1.8-5.9c-.3-.9.3-1.9,1.2-2.2l52.6-16.2Z" />
      </g>
      <g fill="#231f20">
        <path d="M183.7,326.3c.8-.5,1.9-.2,2.4.7l3,5.4c.5.8.1,2-.7,2.4l-48,27.1,12.5,22.1c.5.9.1,2-.7,2.4l-4.5,2.5c-.8.5-1.9.2-2.4-.7l-16.4-29c-.5-.9-.1-2,.7-2.4l54-30.5Z" />
        <path d="M231.6,377.2c16.1,9.6,21.2,30.3,11.5,46.3-9.6,16.1-30.1,21.1-46.2,11.5-16.1-9.6-21.2-30.1-11.6-46.1,9.6-16.1,30.2-21.4,46.2-11.7ZM201.6,427.3c11.5,6.9,26.6,3,33.5-8.5,6.8-11.4,3.3-26.8-8.2-33.7-11.4-6.8-26.7-2.7-33.5,8.7-6.9,11.5-3.2,26.7,8.2,33.5Z" />
        <path d="M303.2,425c5.7,2,11.3,6.5,11.5,14.8.3,10.5-8.1,18.3-19.9,18.7l-22,.7c-1,0-1.8-.8-1.8-1.7l-1.9-62c0-.9.7-1.8,1.7-1.8l21-.6c11.3-.3,19.7,6.9,20,16.7.2,7-3.6,12.4-8.6,15.1v.2ZM291.8,421.5c6-.2,9.9-4.4,9.7-10.3-.2-6.2-4.3-9.5-10.3-9.3l-12.3.4.6,19.7,12.3-.4ZM294.9,449.9c6.4-.2,9.6-4.7,9.4-10.5-.2-5.7-4.6-9.7-10-9.5l-14.6.4.6,20,14.6-.4Z" />
        <path d="M369.1,399c5.9-1.1,13,.1,17.3,7.3,5.4,9,2,19.9-8.1,26l-18.8,11.4c-.9.5-2,.2-2.4-.6l-32.1-53.1c-.5-.8-.3-1.9.6-2.4l18-10.8c9.7-5.9,20.6-3.7,25.6,4.8,3.6,6,3,12.5-.1,17.4v.2ZM357.4,401.5c5.1-3.1,6.4-8.7,3.4-13.8-3.2-5.3-8.4-6.2-13.6-3.1l-10.5,6.3,10.2,16.8,10.5-6.3ZM374.1,424.7c5.5-3.3,6.1-8.8,3.1-13.8-3-4.9-8.8-6.2-13.4-3.4l-12.5,7.6,10.4,17.2,12.5-7.6Z" />
        <path d="M399.6,353.2l-11.7-26.6c-.2-.4-.3-1.2,0-1.7l3.6-6c.8-1.3,2.4-1.2,3.1.1l15.4,35.1,25.6,15.3c.8.5,1.1,1.6.6,2.4l-3.2,5.3c-.5.9-1.6,1.1-2.4.6l-25.6-15.3-38.1,2.7c-1.4,0-2.3-1.4-1.6-2.7l3.6-5.9c.4-.6,1-.8,1.5-.9l29-2.3v-.2Z" />
      </g>
      <line x1="60.3" y1="286.2" x2="512.2" y2="286.2" fill="currentColor" className="text-[#ed1b2f]" stroke="#231f20" strokeMiterlimit="10" strokeWidth="15.6" />
    </svg>
  );
}

const Icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  accounts: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  domains: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  interested: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  invitations: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  emails: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  plans: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  staff: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  ),
  security: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  panelRightOpen: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path d="m10 15-3-3 3-3" />
    </svg>
  ),
  panelRightClose: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path d="m8 9 3 3-3 3" />
    </svg>
  ),
};

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  try {
    requireUserAuth(session, "/login");
  } catch {
    throw redirect("/login");
  }

  if (!isAdmin(session)) {
    throw redirect("/login");
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const [key, ...val] = c.split("=");
        return [key, val.join("=")];
      })
  );
  const sidebarCollapsed = cookies[SIDEBAR_COOKIE] === "collapsed";

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
      staffRole: session.staffRole as "OWNER" | "ADMIN" | undefined,
    },
    canManageStaff: isStaffOwner(session),
    sidebarCollapsed,
  };
}

const navItems: { to: string; label: string; end?: boolean; staffOnly?: boolean; icon: keyof typeof Icons }[] = [
  { to: "/", label: "Dashboard", end: true, icon: "dashboard" },
  { to: "/accounts", label: "Accounts", icon: "accounts" },
  { to: "/users", label: "Users", icon: "users" },
  { to: "/domains", label: "Domains", icon: "domains" },
  { to: "/interested", label: "Interested", icon: "interested" },
  { to: "/invitations", label: "Invitations", icon: "invitations" },
  { to: "/emails", label: "Emails", icon: "emails" },
  { to: "/plans", label: "Plans", icon: "plans" },
  { to: "/staff", label: "Staff", staffOnly: true, icon: "staff" },
  { to: "/security", label: "Security", icon: "security" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function Layout() {
  const { user, canManageStaff, sidebarCollapsed: initialCollapsed } = useLoaderData<typeof loader>();
  const visibleNavItems = navItems.filter((item) => !item.staffOnly || canManageStaff);

  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    document.cookie = `${SIDEBAR_COOKIE}=${newState ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isUserMenuOpen]);

  const staffRoleLabel = user.staffRole === "OWNER" ? "Owner" : user.staffRole === "ADMIN" ? "Admin" : null;

  // When mobile menu is open, always show labels (ignore desktop collapsed state)
  const sidebarShowLabels = !isCollapsed || isMobileOpen;

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary flex">
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-1 left-1 bottom-1 z-50 h-[calc(100vh-8px)] bg-theme-secondary shadow-md rounded-xl border border-black/10 dark:border-white/15 flex flex-col transition-all duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsed ? "lg:w-[72px]" : "lg:w-64",
          "w-64"
        )}
      >
        <div className={cn("flex items-center gap-3 px-4 lg:px-6 py-[13px]", isCollapsed && !isMobileOpen ? "lg:justify-center lg:px-3" : "")}>
          <Logo className="w-9 h-9 shrink-0" />
          {sidebarShowLabels && <span className="text-lg font-semibold tracking-tight text-theme-primary">Admin</span>}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden ml-auto p-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary cursor-pointer"
            aria-label="Close menu"
          >
            {Icons.close}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer",
                  isCollapsed && !isMobileOpen && "lg:justify-center lg:px-0",
                  isActive ? "bg-(--color-brand-red-muted) text-(--color-brand-red)" : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                )
              }
              title={!sidebarShowLabels ? item.label : undefined}
            >
              {Icons[item.icon]}
              {sidebarShowLabels && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 pl-[8px] pr-[2px] pt-[2px]">
          <div className="rounded-xl border border-transparent bg-transparent transition-all duration-300">
            <div className="flex items-center justify-between px-4 lg:px-6 py-[13px]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="hidden lg:flex p-2 -ml-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary transition-colors cursor-pointer"
                  title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isCollapsed ? Icons.panelRightClose : Icons.panelRightOpen}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(true)}
                  className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary cursor-pointer"
                  aria-label="Open menu"
                >
                  {Icons.menu}
                </button>
                <div className="lg:hidden flex items-center gap-2">
                  <Logo className="w-7 h-7" />
                  <span className="font-medium text-sm text-theme-primary">Admin</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ColorModeToggle />
                <div ref={userMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 p-1 rounded-full hover:bg-theme-tertiary transition-colors cursor-pointer"
                    title={user.name || user.email || "User menu"}
                    aria-expanded={isUserMenuOpen}
                    aria-haspopup="true"
                  >
                    <div className="w-8 h-8 rounded-full bg-(--color-brand-red) flex items-center justify-center text-white text-sm font-medium">
                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
                    </div>
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-theme-secondary rounded-lg border border-theme shadow-lg overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-theme">
                        <p className="font-medium text-theme-primary truncate">{user.name || "User"}</p>
                        <p className="text-sm text-theme-muted truncate">{user.email}</p>
                        {staffRoleLabel && (
                          <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium bg-(--color-brand-red-muted) text-(--color-brand-red)">
                            {staffRoleLabel}
                          </span>
                        )}
                      </div>
                      <div className="py-1">
                        <Link
                          to="/profile"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
                        >
                          {Icons.user}
                          <span>Profile</span>
                        </Link>
                      </div>
                      <div className="border-t border-theme py-1">
                        <Form method="post" action="/logout" reloadDocument>
                          <button
                            type="submit"
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
                          >
                            {Icons.logout}
                            <span>Logout</span>
                          </button>
                        </Form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
