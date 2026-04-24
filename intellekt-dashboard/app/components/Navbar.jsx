"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll") || "";

  const menuItems = [
    { label: "Dashboard", href: `/admin?roll=${roll}` },
    { label: "Students", href: `/admin/students?roll=${roll}` },
    { label: "Faculty", href: `/admin/faculty?roll=${roll}` },
    { label: "Tests", href: `/admin/tests?roll=${roll}` },
    { label: "Attendance", href: `/admin/attendance?roll=${roll}` },
    { label: "Marks", href: `/admin/marks?roll=${roll}` },
    { label: "Fees", href: `/admin/fees?roll=${roll}` },
    { label: "Classes", href: `/admin/classes?roll=${roll}` },
  ];

  function isActive(href) {
    const cleanHref = href.split("?")[0];
    return pathname === cleanHref;
  }

  return (
    <div className="w-64 min-h-screen bg-white border-r border-gray-200 p-6 flex flex-col justify-between">
      <div>
        <h1 className="text-2xl font-bold text-black mb-10">Intellekt</h1>

        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`block rounded-lg px-4 py-3 text-lg transition ${
                  isActive(item.href)
                    ? "bg-gray-200 text-black font-semibold"
                    : "text-gray-800 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/login"
        className="block w-full rounded-lg bg-red-500 px-4 py-3 text-center text-lg font-semibold text-white transition hover:bg-red-600"
      >
        Sign Out
      </Link>
    </div>
  );
}