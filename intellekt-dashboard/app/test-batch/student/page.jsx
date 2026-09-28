"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "../../faculty-dashboard/test-batch/components/TestBatchManager";

function TestBatchStudentPageInner() {
  const params = useSearchParams();
  const roll = (params.get("roll") || "").toUpperCase().trim();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!/^IAT[0-9]{3,}$/.test(roll)) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow p-6">
          <h1 className="text-xl font-bold text-red-700">Invalid Test Batch ID</h1>
          <p className="text-gray-600 mt-2">
            Please sign in with a valid Test Batch student ID.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 relative">
      <div className="bg-blue-700 text-white flex justify-between items-center px-4 md:px-8 py-4 shadow">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="text-2xl leading-none"
            aria-label="Open menu"
          >
            ☰
          </button>
          <h1 className="text-lg md:text-xl font-bold tracking-wide">
            INTELLEKT
          </h1>
        </div>
      </div>

      <div className="p-4 md:p-10">
        <div className="max-w-7xl mx-auto">
          <TestBatchManager section="student-dashboard" rollNo={roll} />
        </div>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={
          "fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 " +
          (menuOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div
          className="p-4 text-2xl cursor-pointer w-fit"
          onClick={() => setMenuOpen(false)}
        >
          ✕
        </div>

        <nav className="flex flex-col gap-2 px-6">
          <Link
            href={`/test-batch/student?roll=${roll}`}
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium bg-blue-100 text-blue-700"
          >
            Profile
          </Link>

        </nav>

        <div className="absolute bottom-6 left-0 w-full px-6">
          <Link
            href="/"
            className="block w-full text-center bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold transition"
          >
            Sign Out
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TestBatchStudentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <TestBatchStudentPageInner />
    </Suspense>
  );
}
