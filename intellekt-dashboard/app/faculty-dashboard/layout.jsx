"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

function FacultyLayoutContent({ children }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const facultyId = searchParams.get("id") || "";

  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [testBatchOpen, setTestBatchOpen] = useState(pathname.startsWith("/faculty-dashboard/test-batch"));

  const isPrivilegedFaculty = facultyId === "IG001" || facultyId === "IG002";

  const isActive = (path) => pathname === path;

  const linkClass = (active) =>
    `block rounded-lg px-3 py-2 text-base font-medium transition ${
      active ? "bg-blue-100 text-blue-700" : "text-gray-800 hover:bg-gray-100"
    }`;

  const subLinkClass = (active) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <div className="min-h-screen bg-gray-100 relative">
      <div className="bg-blue-700 text-white flex justify-between items-center px-4 md:px-8 py-4 shadow">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMenuOpen(true)}
            className="text-2xl leading-none"
          >
            ☰
          </button>

          <h1 className="text-lg md:text-xl font-bold tracking-wide">
            INTELLEKT
          </h1>
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
        className={`fixed top-0 left-0 h-dvh max-h-dvh w-72 bg-white shadow-xl z-50 flex flex-col overflow-hidden transform transition-transform duration-300 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          className="p-4 text-2xl cursor-pointer w-fit shrink-0"
          onClick={() => setMenuOpen(false)}
        >
          ✕
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-2 px-6 pb-4">
          <Link
            href={`/faculty-dashboard/profile?id=${facultyId}`}
            onClick={() => setMenuOpen(false)}
            className={linkClass(isActive("/faculty-dashboard/profile"))}
          >
            Profile
          </Link>

          <Link
            href={`/faculty-dashboard/attendance?id=${facultyId}`}
            onClick={() => setMenuOpen(false)}
            className={linkClass(isActive("/faculty-dashboard/attendance"))}
          >
            Attendance
          </Link>

          <Link
            href={`/faculty-dashboard/test?id=${facultyId}`}
            onClick={() => setMenuOpen(false)}
            className={linkClass(isActive("/faculty-dashboard/test"))}
          >
            Test
          </Link>
          <Link
  href={`/faculty-dashboard/syllabus?id=${facultyId}`}
  onClick={() => setMenuOpen(false)}
  className={linkClass(isActive("/faculty-dashboard/syllabus"))}
>
  Syllabus
</Link>

          <div className="rounded-lg">
            <button
              type="button"
              onClick={() => setManageOpen(!manageOpen)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-base font-medium transition ${
                pathname.startsWith("/faculty-dashboard/manage")
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-800 hover:bg-gray-100"
              }`}
            >
              <span>Manage</span>
              <span className="text-sm">{manageOpen ? "▲" : "▼"}</span>
            </button>

            {manageOpen && (
              <div className="mt-2 ml-3 flex flex-col gap-2 border-l-2 border-gray-200 pl-3">
                <Link
                  href={`/faculty-dashboard/manage/students?id=${facultyId}`}
                  onClick={() => setMenuOpen(false)}
                  className={subLinkClass(
                    isActive("/faculty-dashboard/manage/students")
                  )}
                >
                  Students
                </Link>

                <Link
                  href={`/faculty-dashboard/manage/faculty?id=${facultyId}`}
                  onClick={() => setMenuOpen(false)}
                  className={subLinkClass(
                    isActive("/faculty-dashboard/manage/faculty")
                  )}
                >
                  Faculty
                </Link>
              </div>
            )}
          </div>

                    {/^IG\d{3,}$/.test(facultyId.trim()) && (
            <div className="rounded-lg">
              <button
                type="button"
                aria-expanded={testBatchOpen}
                onClick={() => setTestBatchOpen((open) => !open)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-base font-medium transition ${
                  pathname.startsWith("/faculty-dashboard/test-batch")
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-800 hover:bg-gray-100"
                }`}
              >
                <span>Test Batch</span>
                <span className="text-sm">{testBatchOpen ? "▲" : "▼"}</span>
              </button>
              {testBatchOpen && (
                <div className="mt-2 ml-3 flex flex-col gap-2 border-l-2 border-gray-200 pl-3">
                  {[
                    ["mark-entry", "Enter Marks"],
                    ["list", "Test List"],
                    ["schedule", "Post Test"],
                    ["registered-students", "Registered Students"],
                  ].map(([feature, label]) => (
                    <Link
                      key={feature}
                      href={`/faculty-dashboard/test-batch?id=${encodeURIComponent(facultyId)}&feature=${feature}`}
                      onClick={() => setMenuOpen(false)}
                      className={subLinkClass(
                        pathname === "/faculty-dashboard/test-batch" &&
                          searchParams.get("feature") === feature
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {isPrivilegedFaculty && (
            <>
              <Link
                href={`/faculty-dashboard/student-record?id=${encodeURIComponent(facultyId)}`}
                onClick={() => setMenuOpen(false)}
                className={linkClass(isActive("/faculty-dashboard/student-record"))}
              >
                Student Record
              </Link>
              <Link
                href={`/faculty-dashboard/enquiries?id=${encodeURIComponent(facultyId)}`}
                onClick={() => setMenuOpen(false)}
                className={linkClass(isActive("/faculty-dashboard/enquiries"))}
              >
                Enquiries
              </Link>
              <Link
                href={`/faculty-dashboard/requests?id=${encodeURIComponent(facultyId)}`}
                onClick={() => setMenuOpen(false)}
                className={subLinkClass(isActive("/faculty-dashboard/requests"))}
              >
                Requests
              </Link>
            </>
          )}

          <Link
            href={`/reset-password?id=${facultyId}&role=${
              isPrivilegedFaculty ? "admin" : "faculty"
            }`}
            onClick={() => setMenuOpen(false)}
            className={linkClass(isActive("/reset-password"))}
          >
            Reset Password
          </Link>
        </nav>

        <div className="shrink-0 w-full px-6 py-4 border-t border-gray-200 bg-white">
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

export default function FacultyLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <FacultyLayoutContent>{children}</FacultyLayoutContent>
    </Suspense>
  );
}