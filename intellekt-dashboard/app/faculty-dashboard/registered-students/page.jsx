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
  const [showExportOptions, setShowExportOptions] = useState(false);

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

  function normalizeDate(dateValue) {
    if (!dateValue) return "";

    const value = String(dateValue).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
      const [dd, mm, yyyy] = value.split("-");
      return `${yyyy}-${mm}-${dd}`;
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDate(dateValue) {
    const value = normalizeDate(dateValue);

    if (!value) return "-";

    const [yyyy, mm, dd] = value.split("-");
    return `${Number(dd)}/${Number(mm)}/${yyyy}`;
  }

  function formatTime(timeValue) {
    if (!timeValue) return "-";

    return String(timeValue).slice(0, 5);
  }

  useEffect(() => {
    let data = [...students];

    if (selectedClass) {
      data = data.filter(
        (s) => String(s.class || "").trim() === String(selectedClass).trim()
      );
    }

    if (selectedBoard) {
      data = data.filter(
        (s) => String(s.board || "").trim() === String(selectedBoard).trim()
      );
    }

    if (selectedDate) {
      data = data.filter((s) => normalizeDate(s.test_date) === selectedDate);
    }

    setFilteredStudents(data);
  }, [students, selectedClass, selectedBoard, selectedDate]);

  const groupedByDate = useMemo(() => {
    const groups = {};

    filteredStudents.forEach((student) => {
      const key = normalizeDate(student.test_date) || "Unknown";

      if (!groups[key]) groups[key] = [];

      groups[key].push(student);
    });

    return groups;
  }, [filteredStudents]);

  const uniqueBoards = useMemo(() => {
    return [...new Set(classes.map((c) => c.board).filter(Boolean))];
  }, [classes]);

  const uniqueClasses = useMemo(() => {
    return [...new Set(classes.map((c) => c.class).filter(Boolean))];
  }, [classes]);

  function getExportRows() {
    return filteredStudents.map((s) => ({
      roll_no: s.roll_no || "",
      student_name: s.student_name || "",
      class: s.class || "",
      board: s.board || "",
      test_code: s.test_code || "",
      subject_name: s.subject_name || "",
      test_date: formatDate(s.test_date),
      writing_date: formatDate(s.writing_date),
      slot_start: formatTime(s.slot_start),
      slot_end: formatTime(s.slot_end),
      duration_minutes: s.duration_minutes ? `${s.duration_minutes} mins` : "",
    }));
  }

  function exportExcel() {
    if (filteredStudents.length === 0) {
      alert("No records to export");
      return;
    }

    const rows = getExportRows();

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
        </head>
        <body>
          <table border="1">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Class</th>
                <th>Board</th>
                <th>Test Code</th>
                <th>Subject</th>
                <th>Test Date</th>
                <th>Writing Date</th>
                <th>Slot Start</th>
                <th>Slot End</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                    <tr>
                      <td>${r.roll_no}</td>
                      <td>${r.student_name}</td>
                      <td>${r.class}</td>
                      <td>${r.board}</td>
                      <td>${r.test_code}</td>
                      <td>${r.subject_name}</td>
                      <td>${r.test_date}</td>
                      <td>${r.writing_date}</td>
                      <td>${r.slot_start}</td>
                      <td>${r.slot_end}</td>
                      <td>${r.duration_minutes}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "registered_students.xls";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    setShowExportOptions(false);
  }

  function exportPDF() {
    if (filteredStudents.length === 0) {
      alert("No records to export");
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Please allow popups to export PDF");
      return;
    }

    const groupedHtml = Object.entries(groupedByDate)
      .map(([date, students]) => {
        return `
          <h2>Test Date: ${formatDate(date)}</h2>
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Class</th>
                <th>Board</th>
                <th>Test Code</th>
                <th>Subject</th>
                <th>Writing Date</th>
                <th>Slot Start</th>
                <th>Slot End</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${students
                .map(
                  (s) => `
                    <tr>
                      <td>${s.roll_no || "-"}</td>
                      <td>${s.student_name || "-"}</td>
                      <td>${s.class || "-"}</td>
                      <td>${s.board || "-"}</td>
                      <td>${s.test_code || "-"}</td>
                      <td>${s.subject_name || "-"}</td>
                      <td>${formatDate(s.writing_date)}</td>
                      <td>${formatTime(s.slot_start)}</td>
                      <td>${formatTime(s.slot_end)}</td>
                      <td>${
                        s.duration_minutes ? `${s.duration_minutes} mins` : "-"
                      }</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        `;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Registered Students</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }

            h1 {
              color: #1e40af;
              text-align: center;
              margin-bottom: 8px;
            }

            .subtitle {
              text-align: center;
              margin-bottom: 28px;
              color: #4b5563;
            }

            h2 {
              color: #1d4ed8;
              margin-top: 28px;
              margin-bottom: 12px;
              font-size: 18px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
              font-size: 12px;
            }

            th {
              background: #1d4ed8;
              color: white;
              padding: 8px;
              border: 1px solid #1d4ed8;
              text-align: left;
            }

            td {
              padding: 8px;
              border: 1px solid #d1d5db;
            }

            tr:nth-child(even) {
              background: #f9fafb;
            }

            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <h1>Intellekt Academy</h1>
          <div class="subtitle">Registered Students Report</div>
          ${groupedHtml}
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
    setShowExportOptions(false);
  }

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
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <div className="relative">
            <button
              onClick={() => setShowExportOptions((prev) => !prev)}
              className="w-full bg-blue-700 text-white rounded-lg px-4 py-3 hover:bg-blue-800 transition"
            >
              Export
            </button>

            {showExportOptions && (
              <div className="absolute right-0 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                <button
                  onClick={exportPDF}
                  className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-100"
                >
                  Export as PDF
                </button>

                <button
                  onClick={exportExcel}
                  className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-100"
                >
                  Export as Excel
                </button>
              </div>
            )}
          </div>
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
                      <td className="p-3">{formatDate(s.writing_date)}</td>
                      <td className="p-3">{formatTime(s.slot_start)}</td>
                      <td className="p-3">{formatTime(s.slot_end)}</td>
                      <td className="p-3">
                        {s.duration_minutes ? `${s.duration_minutes} mins` : "-"}
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