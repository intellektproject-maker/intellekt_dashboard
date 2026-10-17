"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

const ADMIN_IDS = ["IG001", "IG002"];

export default function TestBatchStudentRecordPage() {
  const params = useSearchParams();
  const adminId = (params.get("id") || "").toUpperCase().trim();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [reportingRoll, setReportingRoll] = useState("");
  const [error, setError] = useState("");
  const [hasViewed, setHasViewed] = useState(false);

  useEffect(() => {
    if (!ADMIN_IDS.includes(adminId)) return;
    let cancelled = false;

    async function loadClasses() {
      setLoadingClasses(true);
      try {
        const query = new URLSearchParams({ adminId });
        const response = await fetch(API_BASE + "/test-batch/students?" + query.toString(), { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load Test Batch classes");
        if (!cancelled) {
          setClasses(Array.isArray(data.available_classes) ? data.available_classes : []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load Test Batch classes");
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    }

    loadClasses();
    return () => { cancelled = true; };
  }, [adminId]);

  async function viewStudents() {
    if (!selectedClass) {
      setStudents([]);
      setHasViewed(false);
      setError("Please select a class.");
      return;
    }

    setLoadingStudents(true);
    setError("");
    setHasViewed(true);
    try {
      const query = new URLSearchParams({ adminId, class: selectedClass });
      const response = await fetch(API_BASE + "/test-batch/students?" + query.toString(), { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load Test Batch students");
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch (e) {
      setStudents([]);
      setError(e.message || "Failed to load Test Batch students");
    } finally {
      setLoadingStudents(false);
    }
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-GB");
  }

  function marksPercent(mark) {
    const obtained = Number(mark.marks_obtained);
    const total = Number(mark.total_marks);
    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) return null;
    return (obtained / total) * 100;
  }

  async function downloadReport(student) {
    setReportingRoll(student.roll_no);
    setError("");
    try {
      const [marksResponse, attendanceResponse] = await Promise.all([
        fetch(API_BASE + "/test-batch/marks/" + encodeURIComponent(student.roll_no), { cache: "no-store" }),
        fetch(API_BASE + "/test-batch/attendance/" + encodeURIComponent(student.roll_no), { cache: "no-store" }),
      ]);

      const marksData = await marksResponse.json().catch(() => ({}));
      const attendanceData = await attendanceResponse.json().catch(() => ({}));
      if (!marksResponse.ok) throw new Error(marksData.error || "Could not load Test Batch marks");
      if (!attendanceResponse.ok) throw new Error(attendanceData.error || "Could not load Test Batch attendance");

      const marks = Array.isArray(marksData) ? marksData : [];
      const attendance = Array.isArray(attendanceData.attendance) ? attendanceData.attendance : [];
      const presentDays = attendance.filter((item) => String(item.status).toLowerCase() === "present").length;
      const absentDays = attendance.filter((item) => String(item.status).toLowerCase() === "absent").length;
      const totalDays = presentDays + absentDays;
      const attendancePercent = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : "0.00";
      const validPercentages = marks.map(marksPercent).filter((value) => value !== null);
      const average = validPercentages.length
        ? (validPercentages.reduce((sum, value) => sum + value, 0) / validPercentages.length).toFixed(2)
        : "N/A";
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setTextColor(0, 3, 81);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("Intellekt Academy", pageWidth / 2, 18, { align: "center" });
      doc.setFontSize(11);
      doc.text("TEST BATCH STUDENT REPORT", pageWidth / 2, 26, { align: "center" });
      doc.setTextColor(70, 70, 70);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Report Date: " + today, pageWidth / 2, 33, { align: "center" });

      autoTable(doc, {
        startY: 40,
        head: [["Student Details", "Value", "Academic Details", "Value"]],
        body: [
          ["Roll No", student.roll_no || "-", "Class", student.class || "-"],
          ["Name", student.name || "-", "Board", student.board || "-"],
          ["Test Series", student.test_series_name || "-", "Attendance", attendancePercent + "%"],
          ["Present Days", String(presentDays), "Absent Days", String(absentDays)],
          ["Tests with Marks", String(marks.length), "Average Score", average === "N/A" ? average : average + "%"],
        ],
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [12, 61, 145], textColor: [255, 255, 255] },
      });

      let nextY = (doc.lastAutoTable?.finalY || 90) + 10;
      doc.setTextColor(0, 3, 81);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Test Performance", 14, nextY);
      autoTable(doc, {
        startY: nextY + 4,
        head: [["Test Code", "Subject", "Marks Obtained", "Total Marks", "Percentage"]],
        body: marks.length
          ? marks.map((mark) => {
              const percent = marksPercent(mark);
              return [
                mark.test_code || "-",
                mark.subject_name || "-",
                mark.marks_obtained ?? "-",
                mark.total_marks ?? "-",
                percent === null ? "N/A" : percent.toFixed(2) + "%",
              ];
            })
          : [["No marks recorded", "-", "-", "-", "-"]],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [12, 61, 145], textColor: [255, 255, 255] },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.text("INTELLEKT ACADEMY - Test Batch", 14, doc.internal.pageSize.getHeight() - 8);
        },
      });

      nextY = (doc.lastAutoTable?.finalY || nextY + 20) + 10;
      if (nextY > doc.internal.pageSize.getHeight() - 35) {
        doc.addPage();
        nextY = 20;
      }
      doc.setTextColor(0, 3, 81);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Attendance Details", 14, nextY);
      autoTable(doc, {
        startY: nextY + 4,
        head: [["Date", "Test Code", "Subject", "Status"]],
        body: attendance.length
          ? attendance.map((item) => [
              formatDate(item.attendance_date),
              item.test_code || "-",
              item.subject_name || "-",
              item.status || "-",
            ])
          : [["No attendance records", "-", "-", "-"]],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [12, 61, 145], textColor: [255, 255, 255] },
      });

      doc.save(String(student.roll_no || "test-batch-student") + "_report.pdf");
    } catch (e) {
      console.error("Failed to generate Test Batch report", e);
      setError(e.message || "Failed to generate Test Batch report.");
    } finally {
      setReportingRoll("");
    }
  }

  if (!ADMIN_IDS.includes(adminId)) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-700">
          Unauthorized. Test Batch student records are available only to authorized administrators.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <h1 className="mb-8 text-2xl font-bold text-blue-800 md:text-3xl">Test Batch Student Record</h1>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-md">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <select
            aria-label="Select Test Batch class"
            value={selectedClass}
            onChange={(event) => {
              setSelectedClass(event.target.value);
              setStudents([]);
              setHasViewed(false);
              setError("");
            }}
            className="rounded-lg border border-gray-300 px-4 py-3"
            disabled={loadingClasses}
          >
            <option value="">{loadingClasses ? "Loading classes..." : "Select Class"}</option>
            {classes.map((className) => (
              <option key={className} value={className}>{className}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={viewStudents}
            disabled={loadingStudents || loadingClasses}
            className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingStudents ? "Loading..." : "View Students"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-5 text-center text-sm text-red-600">{error}</p>}

      {loadingStudents ? (
        <div className="text-center text-gray-600">Loading students...</div>
      ) : students.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-md">
          <table className="min-w-full">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-4 py-3 text-left">Roll No</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Board</th>
                <th className="px-4 py-3 text-left">Test Series</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.roll_no} className="border-t">
                  <td className="px-4 py-3">{student.roll_no}</td>
                  <td className="px-4 py-3">{student.name || "-"}</td>
                  <td className="px-4 py-3">{student.class || "-"}</td>
                  <td className="px-4 py-3">{student.board || "-"}</td>
                  <td className="px-4 py-3">{student.test_series_name || "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => downloadReport(student)}
                      disabled={reportingRoll !== ""}
                      className="whitespace-nowrap rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reportingRoll === student.roll_no ? "Generating..." : "Download Report"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : hasViewed ? (
        <div className="text-center text-gray-500">No Test Batch students found for this class.</div>
      ) : (
        <div className="text-center text-gray-500">Select a class and choose View Students.</div>
      )}
    </div>
  );
}
