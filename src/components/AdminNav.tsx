"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  type AdminNavItem,
  type AdminNavLink,
  itemActive,
  linkActive,
  sectionWithChildren,
} from "@/lib/nav/admin-nav";

const TAB =
  "rounded-md px-3 py-1.5 text-sm";
const TAB_ACTIVE = `${TAB} bg-amber-700 text-amber-50`;
const TAB_IDLE = `${TAB} text-stone-300 hover:bg-stone-800 hover:text-white`;
const MOBILE =
  "rounded-md px-3 py-3 text-base";
const MOBILE_ACTIVE = `${MOBILE} bg-amber-700 text-amber-50`;
const MOBILE_IDLE = `${MOBILE} text-stone-200 hover:bg-stone-800`;

function NavBadges({
  href,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
  mobile,
}: {
  href: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
  mobile?: boolean;
}) {
  const wrap = mobile ? "ml-2" : "ml-1";
  return (
    <>
      {href === "/commandes" && pendingCommandes > 0 ? (
        <span className={`${wrap} rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-stone-900`}>
          {pendingCommandes}
        </span>
      ) : null}
      {href === "/reunion" && pendingReunion > 0 ? (
        <span className={`${wrap} rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-stone-900`}>
          {pendingReunion}
        </span>
      ) : null}
      {href === "/" && pendingLancements > 0 ? (
        <span className={`${wrap} rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-stone-900`}>
          {pendingLancements}
        </span>
      ) : null}
    </>
  );
}

function NavLink({
  item,
  className,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
  mobile,
  onNavigate,
}: {
  item: AdminNavLink;
  className: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      prefetch={item.prefetch === false ? false : undefined}
      onClick={onNavigate}
      className={className}
    >
      {item.label}
      <NavBadges
        href={item.href}
        pendingCommandes={pendingCommandes}
        pendingReunion={pendingReunion}
        pendingLancements={pendingLancements}
        mobile={mobile}
      />
    </Link>
  );
}

function DesktopGroup({
  item,
  currentPath,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
}: {
  item: AdminNavItem;
  currentPath: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = itemActive(item, currentPath);
  const children = item.children ?? [];

  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (children.length === 0) {
    return (
        <NavLink
          item={item}
          className={active ? TAB_ACTIVE : TAB_IDLE}
        pendingCommandes={pendingCommandes}
        pendingReunion={pendingReunion}
        pendingLancements={pendingLancements}
      />
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex">
        <NavLink
          item={item}
          className={`${active ? TAB_ACTIVE : TAB_IDLE} rounded-r-none`}
          pendingCommandes={pendingCommandes}
          pendingReunion={pendingReunion}
          pendingLancements={pendingLancements}
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Sous-onglets ${item.label}`}
          onClick={() => setOpen((value) => !value)}
          className={`${active ? TAB_ACTIVE : TAB_IDLE} rounded-l-none px-1.5`}
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-40 mt-1 min-w-[12rem] rounded-md border border-stone-700 bg-stone-900 py-1 shadow-lg"
        >
          {children.map((child) => (
            <NavLink
              key={child.href}
              item={child}
              className={`block rounded-none px-3 py-2 text-sm ${
                linkActive(child.href, currentPath)
                  ? "bg-amber-700 text-amber-50"
                  : "text-stone-200 hover:bg-stone-800"
              }`}
              pendingCommandes={pendingCommandes}
              pendingReunion={pendingReunion}
              pendingLancements={pendingLancements}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminDesktopNav({
  items,
  currentPath,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
}: {
  items: AdminNavItem[];
  currentPath: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
}) {
  return (
    <nav className="flex flex-wrap items-center justify-end gap-1">
      {items.map((item) => (
        <DesktopGroup
          key={item.href}
          item={item}
          currentPath={currentPath}
          pendingCommandes={pendingCommandes}
          pendingReunion={pendingReunion}
          pendingLancements={pendingLancements}
        />
      ))}
    </nav>
  );
}

export function AdminSectionTabs({
  items,
  currentPath,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
}: {
  items: AdminNavItem[];
  currentPath: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
}) {
  const section = sectionWithChildren(items, currentPath);
  if (!section?.children?.length) return null;
  const subLinks = [
    { href: section.href, label: section.label, prefetch: section.prefetch },
    ...section.children,
  ];
  return (
    <div className="hidden border-t border-stone-800 md:block">
      <nav className="mx-auto flex max-w-[1600px] flex-wrap gap-1 px-4 py-2">
        {subLinks.map((link) => (
          <NavLink
            key={link.href}
            item={link}
            className={linkActive(link.href, currentPath) ? TAB_ACTIVE : TAB_IDLE}
            pendingCommandes={pendingCommandes}
            pendingReunion={pendingReunion}
            pendingLancements={pendingLancements}
          />
        ))}
      </nav>
    </div>
  );
}

export function AdminMobileNav({
  items,
  currentPath,
  pendingCommandes,
  pendingReunion,
  pendingLancements,
  onNavigate,
}: {
  items: AdminNavItem[];
  currentPath: string;
  pendingCommandes: number;
  pendingReunion: number;
  pendingLancements: number;
  onNavigate: () => void;
}) {
  return (
    <nav className="mx-auto flex max-w-[1600px] flex-col gap-1 px-3 py-3">
      {items.map((item) => {
        const active = itemActive(item, currentPath);
        const children = item.children ?? [];
        return (
          <div key={item.href}>
            <NavLink
              item={item}
              className={active ? MOBILE_ACTIVE : MOBILE_IDLE}
              pendingCommandes={pendingCommandes}
              pendingReunion={pendingReunion}
              pendingLancements={pendingLancements}
              mobile
              onNavigate={onNavigate}
            />
            {children.map((child) => (
              <NavLink
                key={child.href}
                item={child}
                className={`ml-3 ${
                  linkActive(child.href, currentPath) ? MOBILE_ACTIVE : MOBILE_IDLE
                }`}
                pendingCommandes={pendingCommandes}
                pendingReunion={pendingReunion}
                pendingLancements={pendingLancements}
                mobile
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
