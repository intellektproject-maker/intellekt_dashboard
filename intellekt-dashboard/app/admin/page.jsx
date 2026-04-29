"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

const API_BASE = "/backend-api";

export default function AdminDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminId = searchParams.get("roll") || searchParams.get("id") || "IP001";

  const [summary, setSummary] = useState({
    totalStudents: 0,
    totalFaculty: 0,
    totalTests: 0,
    totalAttendanceToday: 0,
    totalMarks: 0,
    totalFeesCollected: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      try {
        setLoading(true);

        const res = await fetch(`${API_BASE}/admin/summary`);
        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Failed to load admin summary");
          return;
        }

        setSummary({
          totalStudents: Number(data.totalStudents || 0),
          totalFaculty: Number(data.totalFaculty || 0),
          totalTests: Number(data.totalTests || 0),
          totalAttendanceToday: Number(data.totalAttendanceToday || 0),
          totalMarks: Number(data.totalMarks || 0),
          totalFeesCollected: Number(data.totalFeesCollected || 0),
        });
      } catch (err) {
        console.error("Error loading admin summary:", err);
        alert("Failed to load admin summary");
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, []);

  function goTo(path) {
    router.push(`${path}?roll=${adminId}`);
  }

  const cards = [
    {
      title: "Total Students",
      value: summary.totalStudents,
      action: "Manage Students",
      path: "/admin/students",
    },
    {
      title: "Total Faculty",
      value: summary.totalFaculty,
      action: "Manage Faculty",
      path: "/admin/faculty",
    },
    {
      title: "Total Tests",
      value: summary.totalTests,
      action: "Manage Tests",
      path: "/admin/tests",
    },
    {
      title: "Attendance Today",
      value: summary.totalAttendanceToday,
      action: "Manage Attendance",
      path: "/admin/attendance",
    },
    {
      title: "Total Marks Entries",
      value: summary.totalMarks,
      action: "Manage Marks",
      path: "/admin/marks",
    },
    {
      title: "Fees Collected",
      value: `₹${summary.totalFeesCollected}`,
      action: "Manage Fees",
      path: "/admin/fees",
    },
  ];

  const quickLinks = [
    { label: "Student Management", path: "/admin/students" },
    { label: "Faculty Management", path: "/admin/faculty" },
    { label: "Test Management", path: "/admin/tests" },
    { label: "Attendance Management", path: "/admin/attendance" },
    { label: "Marks Management", path: "/admin/marks" },
    { label: "Fees Management", path: "/admin/fees" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <Sidebar role="admin" roll={adminId} id={adminId} />

      <div className="flex-1 flex flex-col">
        <Navbar />

        <main className="p-4 md:p-6">
          <div className="mb-6">
            <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
              <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
                Welcome, Admin
              </h1>
              <p className="text-gray-600 mt-2">
                Manage students, faculty, tests, attendance, marks, and fees from one place.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl shadow-md p-10 text-center text-gray-600">
              Loading dashboard...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
                {cards.map((card) => (
                  <div
                    key={card.title}
                    className="bg-white rounded-2xl shadow-md p-5 border border-gray-100"
                  >
                    <p className="text-sm text-gray-500">{card.title}</p>
                    <h2 className="text-3xl font-bold text-blue-900 mt-2">
                      {card.value}
                    </h2>
                    <button
                      onClick={() => goTo(card.path)}
                      className="mt-4 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      {card.action}
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-md p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">
                    Quick Actions
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quickLinks.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => goTo(item.path)}
                        className="text-left bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl px-4 py-4 transition"
                      >
                        <span className="font-semibold text-gray-800">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-md p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">
                    Admin Overview
                  </h2>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-gray-600">Students Registered</span>
                      <span className="font-bold text-blue-900">
                        {summary.totalStudents}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-gray-600">Faculty Registered</span>
                      <span className="font-bold text-blue-900">
                        {summary.totalFaculty}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-gray-600">Tests Posted</span>
                      <span className="font-bold text-blue-900">
                        {summary.totalTests}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-gray-600">Attendance Today</span>
                      <span className="font-bold text-blue-900">
                        {summary.totalAttendanceToday}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-gray-600">Marks Records</span>
                      <span className="font-bold text-blue-900">
                        {summary.totalMarks}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Fees Collected</span>
                      <span className="font-bold text-blue-900">
                        ₹{summary.totalFeesCollected}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}