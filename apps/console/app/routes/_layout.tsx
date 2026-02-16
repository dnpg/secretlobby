import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, redirect, Form, useLoaderData, useLocation, useParams, useFetcher, Link } from "react-router";
import type { Route } from "./+types/_layout";
import { ColorModeToggle, cn } from "@secretlobby/ui";

// Cookie name for sidebar state
const SIDEBAR_COOKIE = "console_sidebar";

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 572.4 572.4"
      className={className}
      aria-label="Secret Lobby"
    >
      <circle
        cx="286.2"
        cy="286.2"
        r="226"
        fill="currentColor"
        className="text-[#ed1b2f]"
        stroke="#231f20"
        strokeMiterlimit="10"
        strokeWidth="15.6"
      />
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
      <line
        x1="60.3"
        y1="286.2"
        x2="512.2"
        y2="286.2"
        fill="currentColor"
        className="text-[#ed1b2f]"
        stroke="#231f20"
        strokeMiterlimit="10"
        strokeWidth="15.6"
      />
    </svg>
  );
}

// Icons for nav items
const Icons = {
  lobbies: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  content: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  media: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  playlist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
    </svg>
  ),
  theme: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
    </svg>
  ),
  login: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  social: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  ),
  techInfo: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  ),
  password: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  billing: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
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
  close: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
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
};

const LOBBIES_PER_PAGE = 5;

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");
  const { getLobbiesByAccountId, searchLobbies, countLobbies } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);

  // Require user-based authentication
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  // Parse search params for lobby filtering
  const url = new URL(request.url);
  const lobbySearch = url.searchParams.get("lobbySearch") || "";
  const lobbyPage = parseInt(url.searchParams.get("lobbyPage") || "1", 10);

  // Fetch account and lobby count
  const [account, totalLobbies] = await Promise.all([
    getAccountWithBasicInfo(accountId),
    countLobbies(accountId),
  ]);

  if (!account) {
    throw redirect("/login");
  }

  // Fetch lobbies with pagination/search if needed
  let lobbies;
  if (lobbySearch || totalLobbies > LOBBIES_PER_PAGE) {
    lobbies = await searchLobbies(accountId, lobbySearch, lobbyPage, LOBBIES_PER_PAGE);
  } else {
    lobbies = await getLobbiesByAccountId(accountId);
  }

  // Determine current lobby (from session or default)
  let currentLobbyId = session.currentLobbyId;
  let currentLobbySlug = session.currentLobbySlug;

  // Get all lobbies briefly to find the default if needed
  const allLobbies = await getLobbiesByAccountId(accountId);
  if (!currentLobbyId || !allLobbies.find((l) => l.id === currentLobbyId)) {
    // Fall back to default lobby
    const defaultLobby = allLobbies.find((l) => l.isDefault) || allLobbies[0];
    if (defaultLobby) {
      currentLobbyId = defaultLobby.id;
      currentLobbySlug = defaultLobby.slug;
    }
  }

  // Use CORE_DOMAIN from environment
  const baseDomain = process.env.CORE_DOMAIN;
  if (!baseDomain) {
    throw new Error("CORE_DOMAIN environment variable must be set");
  }

  // Detect if we're in local development (check hostname)
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local") || hostname.startsWith("127.0.0.1");

  // Read sidebar state from cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").filter(Boolean).map((c) => {
      const [key, ...val] = c.split("=");
      return [key, val.join("=")];
    })
  );
  const sidebarCollapsed = cookies[SIDEBAR_COOKIE] === "collapsed";

  // Calculate pagination
  const totalPages = Math.ceil(totalLobbies / LOBBIES_PER_PAGE);
  const needsPagination = totalLobbies > LOBBIES_PER_PAGE;

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
    },
    account: {
      id: account.id,
      slug: account.slug,
      role: session.currentAccountRole,
    },
    lobbies: lobbies.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      isDefault: l.isDefault,
    })),
    lobbyPagination: {
      currentPage: lobbyPage,
      totalPages,
      totalLobbies,
      needsPagination,
      search: lobbySearch,
    },
    currentLobbyId,
    currentLobbySlug,
    baseDomain,
    isLocalDev,
    sidebarCollapsed,
  };
}

// Main navigation items (shown when NOT editing a lobby)
const mainNavItems = [
  { to: "lobbies", label: "Lobbies", icon: "lobbies" as const },
  { to: "media", label: "Media", icon: "media" as const },
  { to: "settings", label: "Settings", icon: "settings" as const },
];

// Lobby-specific navigation items (shown when editing a lobby)
const lobbyNavItems = [
  { to: "", label: "Content", end: true, icon: "content" as const },
  { to: "playlist", label: "Playlist", icon: "playlist" as const },
  { to: "theme", label: "Theme", icon: "theme" as const },
  { to: "login-page", label: "Login Page", icon: "login" as const },
  { to: "social", label: "Social Links", icon: "social" as const },
  { to: "technical-info", label: "Tech Info", icon: "techInfo" as const },
  { to: "password", label: "Password", icon: "password" as const },
];

export default function AdminLayout() {
  const { user, account, lobbies, lobbyPagination, currentLobbyId, currentLobbySlug, baseDomain, isLocalDev, sidebarCollapsed: initialCollapsed } = useLoaderData<typeof loader>();
  const location = useLocation();
  const params = useParams();
  const fetcher = useFetcher();

  // Detect if we're in a lobby editing context
  const isInLobbyRoute = location.pathname.startsWith("/lobby/");
  const lobbyIdFromUrl = params.lobbyId;
  const currentEditingLobby = lobbyIdFromUrl ? lobbies.find((l) => l.id === lobbyIdFromUrl) : null;

  // Sidebar state
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [lobbySearch, setLobbySearch] = useState(lobbyPagination.search);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isLobbySwitcherOpen, setIsLobbySwitcherOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const lobbySwitcherRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Toggle sidebar and save to cookie
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    // Save to cookie (expires in 1 year)
    document.cookie = `${SIDEBAR_COOKIE}=${newState ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  };

  // Close mobile menu and lobby switcher on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setIsLobbySwitcherOpen(false);
  }, [location.pathname]);

  // Close lobby switcher when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (lobbySwitcherRef.current && !lobbySwitcherRef.current.contains(event.target as Node)) {
        setIsLobbySwitcherOpen(false);
      }
    }
    if (isLobbySwitcherOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isLobbySwitcherOpen]);

  // Close user menu when clicking outside
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

  // Handle lobby search with debounce
  const handleLobbySearch = (value: string) => {
    setLobbySearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      const searchParams = new URLSearchParams(location.search);
      if (value) {
        searchParams.set("lobbySearch", value);
        searchParams.set("lobbyPage", "1");
      } else {
        searchParams.delete("lobbySearch");
        searchParams.delete("lobbyPage");
      }
      fetcher.load(`${location.pathname}?${searchParams.toString()}`);
    }, 300);
    setSearchTimeout(timeout);
  };

  // Handle lobby page change
  const handleLobbyPageChange = (page: number) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("lobbyPage", page.toString());
    if (lobbySearch) searchParams.set("lobbySearch", lobbySearch);
    fetcher.load(`${location.pathname}?${searchParams.toString()}`);
  };

  // Use fetcher data if available, otherwise use loader data
  const displayLobbies = fetcher.data?.lobbies || lobbies;
  const displayPagination = fetcher.data?.lobbyPagination || lobbyPagination;

  // Determine which nav items to show
  const navItems = isInLobbyRoute ? lobbyNavItems : mainNavItems;
  const baseNavPath = isInLobbyRoute ? `/lobby/${lobbyIdFromUrl}` : "";

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary flex">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-1 left-1 bottom-1 z-50 h-[calc(100vh-8px)] bg-theme-secondary shadow-md rounded-xl
          border border-black/10 dark:border-white/15
          flex flex-col transition-all duration-300 ease-in-out
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isCollapsed ? "lg:w-[72px]" : "lg:w-64"}
          w-64
        `}
      >
        {/* Logo Header */}
        <div className={`flex items-center gap-3 px-4 lg:px-6 py-[13px] ${isCollapsed ? "lg:justify-center lg:px-3" : ""}`}>
          <Logo className="w-9 h-9 flex-shrink-0 logo-animated" />
          {!isCollapsed && (
            <span className="text-lg font-semibold tracking-tight">Console</span>
          )}
          {/* Mobile close button */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden ml-auto p-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary cursor-pointer"
          >
            {Icons.close}
          </button>
        </div>

        {/* Back to Main Menu (when in lobby edit mode) */}
        {isInLobbyRoute && (
          <div className={`p-3 border-b border-theme ${isCollapsed ? "lg:px-2" : ""}`}>
            <NavLink
              to="/lobbies"
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer
                text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary
                ${isCollapsed ? "lg:justify-center lg:px-0" : ""}
              `}
              title={isCollapsed ? "Back to Lobbies" : undefined}
            >
              {Icons.back}
              {!isCollapsed && <span>Back to Lobbies</span>}
            </NavLink>
          </div>
        )}

        {/* Lobby Switcher Dropdown (when editing a lobby) */}
        {isInLobbyRoute && !isCollapsed && (
          <div ref={lobbySwitcherRef} className="relative p-3 border-b border-theme">
            {/* Dropdown Toggle Button */}
            <button
              type="button"
              onClick={() => setIsLobbySwitcherOpen(!isLobbySwitcherOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm bg-theme-tertiary hover:bg-[var(--color-secondary-hover)] rounded-lg border border-theme transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-theme-secondary">Lobby:</span>
                <span className="font-medium truncate">{currentEditingLobby?.name}</span>
              </div>
              <svg
                className={cn("w-4 h-4 text-theme-muted transition-transform flex-shrink-0", isLobbySwitcherOpen && "rotate-180")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Content - Absolutely positioned */}
            {isLobbySwitcherOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-theme-secondary rounded-lg border border-theme shadow-lg overflow-hidden">
                {/* Search (only if pagination needed) */}
                {displayPagination.needsPagination && (
                  <div className="p-2 border-b border-theme">
                    <input
                      type="text"
                      placeholder="Search lobbies..."
                      value={lobbySearch}
                      onChange={(e) => handleLobbySearch(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-theme-tertiary border border-theme rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-red)]"
                    />
                  </div>
                )}

                {/* Lobby List */}
                <div className="max-h-48 overflow-y-auto py-1">
                  {displayLobbies.map((lobby: { id: string; name: string; slug: string; isDefault: boolean }) => (
                    <Link
                      key={lobby.id}
                      to={`/lobby/${lobby.id}`}
                      onClick={() => setIsLobbySwitcherOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-4 py-2 text-sm transition-all cursor-pointer",
                        lobby.id === lobbyIdFromUrl
                          ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                          : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{lobby.name}</span>
                        {lobby.isDefault && (
                          <span className="text-xs opacity-60">(default)</span>
                        )}
                      </div>
                      {lobby.id === lobbyIdFromUrl && (
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </Link>
                  ))}
                  {displayLobbies.length === 0 && (
                    <p className="text-sm text-theme-muted px-4 py-2">No lobbies found</p>
                  )}
                </div>

                {/* Pagination (if needed) */}
                {displayPagination.needsPagination && displayPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-theme">
                    <button
                      type="button"
                      onClick={() => handleLobbyPageChange(displayPagination.currentPage - 1)}
                      disabled={displayPagination.currentPage <= 1}
                      className="px-2 py-1 text-xs text-theme-secondary hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ← Prev
                    </button>
                    <span className="text-xs text-theme-muted">
                      {displayPagination.currentPage} / {displayPagination.totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLobbyPageChange(displayPagination.currentPage + 1)}
                      disabled={displayPagination.currentPage >= displayPagination.totalPages}
                      className="px-2 py-1 text-xs text-theme-secondary hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const to = item.to ? `${baseNavPath}/${item.to}` : baseNavPath || "/";
            return (
              <NavLink
                key={item.to}
                to={to}
                end={item.end}
                onClick={() => setIsMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer
                  ${isCollapsed ? "lg:justify-center lg:px-0" : ""}
                  ${
                    isActive
                      ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                      : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                  }`
                }
                title={isCollapsed ? item.label : undefined}
              >
                {Icons[item.icon]}
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 lg:px-6 py-[13px]">
            {/* Left side - Toggle & Mobile menu */}
            <div className="flex items-center gap-2">
              {/* Sidebar toggle (Desktop) */}
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex p-2 -ml-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary transition-colors cursor-pointer"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? Icons.panelRightClose : Icons.panelRightOpen}
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary cursor-pointer"
              >
                {Icons.menu}
              </button>

              {/* Current Context (Mobile) */}
              <div className="lg:hidden flex items-center gap-2">
                <Logo className="w-7 h-7" />
                <span className="font-medium text-sm">
                  {isInLobbyRoute && currentEditingLobby ? currentEditingLobby.name : "Console"}
                </span>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-3">
              <ColorModeToggle />

              {/* User Menu Dropdown */}
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-theme-tertiary transition-colors cursor-pointer"
                  title={user.name || user.email || "User menu"}
                >
                  {/* User Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[var(--color-brand-red)] flex items-center justify-center text-white text-sm font-medium">
                    {(user.name || user.email || "U").charAt(0).toUpperCase()}
                  </div>
                </button>

                {/* User Dropdown */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-theme-secondary rounded-lg border border-theme shadow-lg overflow-hidden z-50">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-theme">
                      <p className="font-medium text-theme-primary truncate">{user.name || "User"}</p>
                      <p className="text-sm text-theme-muted truncate">{user.email}</p>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <Link
                        to="/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
                      >
                        {Icons.user}
                        <span>Profile</span>
                      </Link>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
                      >
                        {Icons.billing}
                        <span>Billing</span>
                      </Link>
                    </div>

                    {/* Logout */}
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
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
