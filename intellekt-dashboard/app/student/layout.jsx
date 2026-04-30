"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function StudentLayoutContent({ children }) {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll") || "";

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 relative">
      <div className="bg-blue-700 text-white flex justify-between items-center px-4 md:px-8 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setMenuOpen(true)} className="text-2xl">
            ☰
          </button>

          <h1 className="text-lg md:text-xl font-bold">INTELLEKT</h1>
        </div>
      </div>

      <div className="p-4 md:p-10">{children}</div>

      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white shadow z-50 transform transition-transform duration-300 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          className="p-4 text-xl cursor-pointer"
          onClick={() => setMenuOpen(false)}
        >
          ✕
        </div>

        <nav className="flex flex-col gap-4 px-6">
          <Link href={`/student?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Profile
          </Link>

          <Link href={`/student/attendance?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Attendance
          </Link>

          <Link href={`/student/marks?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Marks
          </Link>

          <Link href={`/student/test-schedule?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Test Schedule
          </Link>

          <Link href={`/student/fee?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Fee
          </Link>

          <Link href={`/student/useful-links?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Useful Links
          </Link>

          <Link href={`/student/request-pdf?roll=${roll}`} onClick={() => setMenuOpen(false)}>
            Request PDF
          </Link>
        </nav>

        <div className="absolute bottom-6 left-0 w-full px-6">
          <Link
            href="/"
            className="block text-center bg-red-500 text-white py-2 rounded"
          >
            Sign Out
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function StudentLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <StudentLayoutContent>{children}</StudentLayoutContent>
    </Suspense>
  );
}