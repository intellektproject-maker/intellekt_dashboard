"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

function RegisteredStudentsInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [classes, setClasses] = useState([]);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedBoard, setSelectedBoard] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`, {
          cache: "no-store",
        });

        const data = await res.json();

        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setClasses([]);
      }
    }

    loadClasses();
  }, []);

  async function fetchRegisteredStudents() {
    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (selectedClass) params.append("className", selectedClass);
      if (selectedBoard) params.append("board", selectedBoard);
      if (selectedDate) params.append("date", selectedDate);

      const res = await fetch(
        `${API_BASE}/registered-students?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data = await res.json();

      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRegisteredStudents();
  }, [selectedClass, selectedBoard, selectedDate]);

  useEffect(() => {
    let data = [...students];

    if (selectedClass) {
      data = data.filter(
        (s) =>
          String(s.class || "").trim() ===
          String(selectedClass).trim()
      );
    }

    if (selectedBoard) {
      data = data.filter(
        (s) =>
          String(s.board || "").trim() ===
          String(selectedBoard).trim()
      );
    }

    if (selectedDate) {
      data = data.filter((s) => {
        if (!s.test_date) return false;

        const dbDate = new Date(s.test_date)
          .toISOString()
          .split("T")[0];

        return dbDate === selectedDate;
      });
    }

    setFilteredStudents(data);
  }, [students, selectedClass, selectedBoard, selectedDate]);

  const groupedByDate = useMemo(() => {
    const groups = {};

    filteredStudents.forEach((student) => {
      const key = student.test_date
        ? new Date(student.test_date).toISOString().split("T")[0]
        : "Unknown";

      if (!groups[key]) groups[key] = [];

      groups[key].push(student);
    });

    return groups;
  }, [filteredStudents]);

  function formatDate(dateValue) {
    if (!dateValue) return "-";

    const d = new Date(dateValue);

    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("en-IN");
  }

  function exportCSV() {
    if (filteredStudents.length === 0) {
      alert("No records to export");
      return;
    }

    const headers = [
      "Roll No",
      "Student Name",
      "Class",
      "Board",
      "Test Code",
      "Subject",
      "Test Date",
      "Writing Date",
      "Slot Start",
      "Slot End",
      "Duration",
    ];

    const rows = filteredStudents.map((s) => [
      s.roll_no || "",
      s.student_name || "",
      s.class || "",
      s.board || "",
      s.test_code || "",
      s.subject_name || "",
      formatDate(s.test_date),
      formatDate(s.writing_date),
      s.slot_start || "",
      s.slot_end || "",
      s.duration_minutes || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "registered_students.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const uniqueBoards = useMemo(() => {
    return [...new Set(classes.map((c) => c.board).filter(Boolean))];
  }, [classes]);

  const uniqueClasses = useMemo(() => {
    return [...new Set(classes.map((c) => c.class).filter(Boolean))];
  }, [classes]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Registered Students
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">All Classes</option>

            {uniqueClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <select
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">All Boards</option>

            {uniqueBoards.map((board) => (
              <option key={board} value={board}>
                {board}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const value = e.target.value;

              const today = new Date()
                .toISOString()
                .split("T")[0];

              if (value > today) {
                alert("Future dates are not allowed");
                return;
              }

              setSelectedDate(value);
            }}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <button
            onClick={exportCSV}
            className="bg-blue-700 text-white rounded-lg px-4 py-3 hover:bg-blue-800 transition"
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
          <p className="text-gray-600">Loading...</p>
        </div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-center">
            No registered students found
          </p>
        </div>
      ) : (
        Object.entries(groupedByDate).map(([date, students]) => (
          <div key={date} className="mb-10">
            <h2 className="text-xl font-bold text-blue-700 mb-4">
              Test Date: {formatDate(date)}
            </h2>

            <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3">Roll No</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Board</th>
                    <th className="p-3">Test Code</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Writing Date</th>
                    <th className="p-3">Slot Start</th>
                    <th className="p-3">Slot End</th>
                    <th className="p-3">Duration</th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((s, index) => (
                    <tr
                      key={`${s.roll_no}-${s.test_code}-${index}`}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="p-3">{s.roll_no || "-"}</td>
                      <td className="p-3">{s.student_name || "-"}</td>
                      <td className="p-3">{s.class || "-"}</td>
                      <td className="p-3">{s.board || "-"}</td>
                      <td className="p-3 text-blue-700 font-semibold">
                        {s.test_code || "-"}
                      </td>
                      <td className="p-3">{s.subject_name || "-"}</td>
                      <td className="p-3">
                        {formatDate(s.writing_date)}
                      </td>
                      <td className="p-3">{s.slot_start || "-"}</td>
                      <td className="p-3">{s.slot_end || "-"}</td>
                      <td className="p-3">
                        {s.duration_minutes
                          ? `${s.duration_minutes} mins`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function RegisteredStudentsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <RegisteredStudentsInner />
    </Suspense>
  );
}