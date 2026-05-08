"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ClipboardCheck,
  BookOpen,
  CalendarDays,
  Wallet,
  Link as LinkIcon,
  FileText,
} from "lucide-react";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

function StudentPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roll = searchParams.get("roll");

  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [marks, setMarks] = useState([]);
  const [tests, setTests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roll) return;

    async function loadDashboardData() {
      try {
        setLoading(true);

        const [studentRes, attendanceRes, marksRes, testsRes, notifyRes] =
          await Promise.allSettled([
            fetch(`${API_BASE}/student/${roll}`),
            fetch(`${API_BASE}/attendance/${roll}`),
            fetch(`${API_BASE}/marks/${roll}`),
            fetch(`${API_BASE}/test-schedule/${roll}`),
            fetch(`${API_BASE}/student-notifications/${roll}`),
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

        if (notifyRes.status === "fulfilled" && notifyRes.value.ok) {
          const notifyData = await notifyRes.value.json();
          setNotifications(Array.isArray(notifyData) ? notifyData : []);
        } else {
          setNotifications([]);
        }
      } catch (error) {
        console.error("Error loading student dashboard:", error);
        setStudent(null);
        setAttendance([]);
        setMarks([]);
        setTests([]);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [roll]);

  function hasNotification(moduleName) {
    return notifications.some((item) => item.module_name === moduleName);
  }

  async function openCard(card) {
    try {
      await fetch(`${API_BASE}/student-notifications/read`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roll_no: roll,
          module_name: card.moduleName,
        }),
      });

      setNotifications((prev) =>
        prev.filter((item) => item.module_name !== card.moduleName)
      );
    } catch (err) {
      console.error("Notification read update failed:", err);
    } finally {
      router.push(card.href);
    }
  }

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

  const subjectWiseAverage = useMemo(() => {
    if (!marks.length) {
      return {
        maths: "0",
        physics: "0",
      };
    }

    const mathsMarks = marks.filter(
      (item) =>
        item.subject_name?.toLowerCase() === "maths" ||
        item.test_code?.toUpperCase().includes("M")
    );

    const physicsMarks = marks.filter(
      (item) =>
        item.subject_name?.toLowerCase() === "physics" ||
        item.test_code?.toUpperCase().includes("P")
    );

    const mathsAverage =
      mathsMarks.length > 0
        ? (
            mathsMarks.reduce(
              (sum, item) => sum + Number(item.marks_obtained || 0),
              0
            ) / mathsMarks.length
          ).toFixed(1)
        : "0";

    const physicsAverage =
      physicsMarks.length > 0
        ? (
            physicsMarks.reduce(
              (sum, item) => sum + Number(item.marks_obtained || 0),
              0
            ) / physicsMarks.length
          ).toFixed(1)
        : "0";

    return {
      maths: mathsAverage,
      physics: physicsAverage,
    };
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
      moduleName: "attendance",
      icon: <ClipboardCheck size={24} />,
    },
    {
      title: "Marks",
      value: `M: ${subjectWiseAverage.maths} | P: ${subjectWiseAverage.physics}`,
      subtitle: "Maths & Physics Avg",
      href: `/student/marks?roll=${roll}`,
      moduleName: "marks",
      icon: <BookOpen size={24} />,
    },
    {
      title: "Test Schedule",
      value: upcomingTestsCount,
      subtitle: "Upcoming Tests",
      href: `/student/test-schedule?roll=${roll}`,
      moduleName: "test-schedule",
      icon: <CalendarDays size={24} />,
    },
    {
      title: "Fee",
      value: "View",
      subtitle: "Fee Details",
      href: `/student/fee?roll=${roll}`,
      moduleName: "fee",
      icon: <Wallet size={24} />,
    },
    {
      title: "Useful Links",
      value: "Open",
      subtitle: "Quick Access",
      href: `/student/useful-links?roll=${roll}`,
      moduleName: "useful-links",
      icon: <LinkIcon size={24} />,
    },
    {
      title: "Request PDF",
      value: "Open",
      subtitle: "Request answer sheet",
      href: `/student/request-pdf?roll=${roll}`,
      moduleName: "request-pdf",
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
                  <span className="font-semibold">
                    {student?.roll_no || roll}
                  </span>
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
                  School Name:{" "}
                  <span className="font-semibold">{schoolName}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => openCard(card)}
                  className="relative text-left bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 block"
                >
                  {hasNotification(card.moduleName) && (
                    <span className="absolute top-4 right-4 h-3 w-3 rounded-full bg-red-600"></span>
                  )}

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
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <StudentPageContent />
    </Suspense>
  );
}