"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ClipboardCheck,
  BookOpen,
  CalendarDays,
  Wallet,
  Link as LinkIcon,
  FileText,
} from "lucide-react";

const API_BASE = "http://192.168.1.26:5050";

export default function StudentPage() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [marks, setMarks] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roll) return;

    async function loadDashboardData() {
      try {
        setLoading(true);

        const [studentRes, attendanceRes, marksRes, testsRes] =
          await Promise.allSettled([
            fetch(`${API_BASE}/student/${roll}`),
            fetch(`${API_BASE}/attendance/${roll}`),
            fetch(`${API_BASE}/marks/${roll}`),
            fetch(`${API_BASE}/test-schedule/${roll}`),
          ]);

        if (studentRes.status === "fulfilled" && studentRes.value.ok) {
          const studentData = await studentRes.value.json();
          setStudent(studentData);
        } else {
          setStudent(null);
        }

        if (attendanceRes.status === "fulfilled" && attendanceRes.value.ok) {
          const attendanceData = await attendanceRes.value.json();
          setAttendance(Array.isArray(attendanceData) ? attendanceData : []);
        } else {
          setAttendance([]);
        }

        if (marksRes.status === "fulfilled" && marksRes.value.ok) {
          const marksData = await marksRes.value.json();
          setMarks(Array.isArray(marksData) ? marksData : []);
        } else {
          setMarks([]);
        }

        if (testsRes.status === "fulfilled" && testsRes.value.ok) {
          const testsData = await testsRes.value.json();
          setTests(Array.isArray(testsData) ? testsData : []);
        } else {
          setTests([]);
        }
      } catch (error) {
        console.error("Error loading student dashboard:", error);
        setStudent(null);
        setAttendance([]);
        setMarks([]);
        setTests([]);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [roll]);

  const attendancePercentage = useMemo(() => {
    if (!attendance.length) return "0%";

    const presentCount = attendance.filter(
      (item) => item.status?.toLowerCase() === "present"
    ).length;

    const totalCount = attendance.filter(
      (item) =>
        item.status?.toLowerCase() === "present" ||
        item.status?.toLowerCase() === "absent"
    ).length;

    if (!totalCount) return "0%";

    return `${Math.round((presentCount / totalCount) * 100)}%`;
  }, [attendance]);

  const averageMarks = useMemo(() => {
    if (!marks.length) return "0";

    const total = marks.reduce(
      (sum, item) => sum + Number(item.marks_obtained || 0),
      0
    );

    return (total / marks.length).toFixed(1);
  }, [marks]);

  const upcomingTestsCount = useMemo(() => {
    if (!tests.length) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tests.filter((test) => {
      if (!test.test_date) return false;
      const testDate = new Date(test.test_date);
      return testDate >= today;
    }).length;
  }, [tests]);

  const studentName = student?.name || "Student";
  const className = student?.class || "-";
  const board = student?.board || "-";
  const phone = student?.phone || "-";
  const email = student?.email || "-";
  const schoolName = student?.school_name || "-";

  const cards = [
    {
      title: "Attendance",
      value: attendancePercentage,
      subtitle: "Total Attendance",
      href: `/student/attendance?roll=${roll}`,
      icon: <ClipboardCheck size={24} />,
    },
    {
      title: "Marks",
      value: averageMarks,
      subtitle: "Average Marks",
      href: `/student/marks?roll=${roll}`,
      icon: <BookOpen size={24} />,
    },
    {
      title: "Test Schedule",
      value: upcomingTestsCount,
      subtitle: "Upcoming Tests",
      href: `/student/test-schedule?roll=${roll}`,
      icon: <CalendarDays size={24} />,
    },
    {
      title: "Fee",
      value: "View",
      subtitle: "Fee Details",
      href: `/student/fee?roll=${roll}`,
      icon: <Wallet size={24} />,
    },
    {
      title: "Useful Links",
      value: "Open",
      subtitle: "Quick Access",
      href: `/student/useful-links?roll=${roll}`,
      icon: <LinkIcon size={24} />,
    },
    {
      title: "Request PDF",
      value: "Open",
      subtitle: "Request answer sheet",
      href: `/student/request-pdf?roll=${roll}`,
      icon: <FileText size={24} />,
    },
  ];

  if (!roll) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ececef] text-red-600 text-lg font-semibold">
        Roll number missing. Please login again.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#ececef]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-5xl font-bold text-blue-700 mb-8">
          Student Dashboard
        </h2>

        {loading ? (
          <div className="text-xl font-medium text-gray-700">Loading...</div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">
                Welcome, {studentName}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-10 text-lg text-gray-700">
                <p>
                  Roll No:{" "}
                  <span className="font-semibold">{student?.roll_no || roll}</span>
                </p>
                <p>
                  Name: <span className="font-semibold">{studentName}</span>
                </p>
                <p>
                  Class: <span className="font-semibold">{className}</span>
                </p>
                <p>
                  Board: <span className="font-semibold">{board}</span>
                </p>
                <p>
                  Phone: <span className="font-semibold">{phone}</span>
                </p>
                <p className="break-all">
                  Email: <span className="font-semibold">{email}</span>
                </p>
                <p className="md:col-span-2 break-words">
                  School Name: <span className="font-semibold">{schoolName}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-blue-700">{card.icon}</div>
                    <span className="text-sm font-semibold text-gray-500">
                      Open
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    {card.title}
                  </h3>

                  <p className="text-3xl font-extrabold text-blue-700 mb-2 break-words">
                    {card.value}
                  </p>

                  <p className="text-gray-600 text-base">{card.subtitle}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}