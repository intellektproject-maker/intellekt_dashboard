"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/backend-api";

export default function StudentRecordPage() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  async function fetchClasses() {
    try {
      const res = await fetch(`${API_BASE}/classes`);
      const data = await res.json();
      setClasses(data);
    } catch (err) {
      console.error("Failed to fetch classes", err);
    }
  }

  async function fetchStudents() {
    if (!selectedClass) {
      setStudents([]);
      return;
    }

    try {
      setLoading(true);
      const [board, className] = selectedClass.split("-");

      const res = await fetch(
        `${API_BASE}/student-records?className=${className}&board=${board}`
      );

      const data = await res.json();
      setStudents(data);
    } catch (err) {
      console.error("Failed to fetch students", err);
    } finally {
      setLoading(false);
    }
  }

  function drawCard(doc, x, y, w, h, title) {
    doc.setDrawColor(28, 77, 150);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2);

    doc.setFillColor(12, 61, 145);
    doc.roundedRect(x, y, 42, 7, 2, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title, x + 3, y + 5);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
  }

  function drawPieChart(doc, centerX, centerY, radius, present, absent) {
    const total = present + absent || 1;
    const presentAngle = (present / total) * 360;

    doc.setFillColor(39, 174, 96);
    doc.circle(centerX, centerY, radius, "F");

    doc.setFillColor(231, 76, 60);
    doc.setDrawColor(231, 76, 60);
    doc.setLineWidth(radius);

    const startAngle = -90;
    const endAngle = startAngle + (360 - presentAngle);

    for (let a = startAngle; a <= endAngle; a += 2) {
      const rad = (a * Math.PI) / 180;
      doc.line(
        centerX,
        centerY,
        centerX + Math.cos(rad) * radius,
        centerY + Math.sin(rad) * radius
      );
    }

    doc.setFillColor(255, 255, 255);
    doc.circle(centerX, centerY, radius * 0.55, "F");

    const percentage = ((present / total) * 100).toFixed(0);

    doc.setTextColor(12, 61, 145);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${percentage}%`, centerX, centerY - 1, { align: "center" });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6);
    doc.text("Attendance", centerX, centerY + 5, { align: "center" });
  }

  function drawMarksGraph(doc, x, y, w, h, marks) {
    if (!marks || marks.length === 0) {
      doc.setFontSize(8);
      doc.text("No marks available", x + 10, y + 20);
      return;
    }

    const graphMarks = marks.slice(0, 5).reverse();
    const maxY = 100;

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);

    for (let i = 0; i <= 4; i++) {
      const gy = y + (h / 4) * i;
      doc.line(x, gy, x + w, gy);
    }

    doc.setDrawColor(60, 120, 190);
    doc.setLineWidth(0.6);

    const points = graphMarks.map((m, index) => {
      const percent =
        m.total_marks && Number(m.total_marks) > 0
          ? (Number(m.marks_obtained) / Number(m.total_marks)) * 100
          : 0;

      const px =
        graphMarks.length === 1
          ? x + w / 2
          : x + (w / (graphMarks.length - 1)) * index;

      const py = y + h - (percent / maxY) * h;

      return { x: px, y: py, percent, code: m.test_code };
    });

    points.forEach((p, i) => {
      if (i > 0) {
        doc.line(points[i - 1].x, points[i - 1].y, p.x, p.y);
      }
    });

    points.forEach((p) => {
      doc.setFillColor(12, 61, 145);
      doc.circle(p.x, p.y, 1.5, "F");

      doc.setFontSize(5);
      doc.setTextColor(0, 0, 0);
      doc.text(`${p.percent.toFixed(0)}%`, p.x, p.y - 3, {
        align: "center",
      });

      doc.text(p.code, p.x, y + h + 6, { align: "center" });
    });

    doc.setFontSize(6);
    doc.text("Test Code", x + w / 2, y + h + 13, { align: "center" });

    doc.saveGraphicsState();
    doc.text("Marks %", x - 8, y + h / 2, { angle: 90 });
    doc.restoreGraphicsState();
  }

  function drawAttendanceBarChart(doc, x, y, present, absent) {
    const maxVal = Math.max(present, absent, 1);
    const barMaxHeight = 28;

    const presentH = (present / maxVal) * barMaxHeight;
    const absentH = (absent / maxVal) * barMaxHeight;

    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);

    doc.setFillColor(39, 174, 96);
    doc.rect(x, y + barMaxHeight - presentH, 10, presentH, "F");
    doc.text(String(present), x + 5, y + barMaxHeight - presentH - 2, {
      align: "center",
    });
    doc.text("Present", x + 5, y + barMaxHeight + 6, { align: "center" });

    doc.setFillColor(231, 76, 60);
    doc.rect(x + 24, y + barMaxHeight - absentH, 10, absentH, "F");
    doc.text(String(absent), x + 29, y + barMaxHeight - absentH - 2, {
      align: "center",
    });
    doc.text("Absent", x + 29, y + barMaxHeight + 6, { align: "center" });
  }

  async function downloadReport(student) {
    try {
      const res = await fetch(
        `${API_BASE}/student-record-report/${student.roll_no}`
      );

      const data = await res.json();

      const doc = new jsPDF("p", "mm", "a4");
      const pageW = doc.internal.pageSize.getWidth();

      const today = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const marks = data.marks || [];
      const presentDays = Number(data.attendance?.present_days || 0);
      const absentDays = Number(data.attendance?.absent_days || 0);
      const totalDays = presentDays + absentDays;
      const attendancePercent =
        totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : "0.00";

      const avgMark =
        marks.length > 0
          ? (
              marks.reduce((sum, m) => {
                const total = Number(m.total_marks || 0);
                const obtained = Number(m.marks_obtained || 0);
                return sum + (total > 0 ? (obtained / total) * 100 : 0);
              }, 0) / marks.length
            ).toFixed(2)
          : "0.00";

      doc.setFillColor(7, 48, 120);
      doc.rect(0, 0, pageW, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("INTELLEKT ACADEMY", 42, 14);

      doc.setFontSize(9);
      doc.text("STUDENT REPORT", pageW / 2, 28, { align: "center" });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(6);
      doc.text(`Report Date : ${today}`, pageW / 2, 35, { align: "center" });

      drawCard(doc, 10, 42, 190, 38, "STUDENT DETAILS");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("Roll No", 18, 54);
      doc.text("Name", 18, 62);
      doc.text("Class", 18, 70);
      doc.text("Phone", 112, 54);
      doc.text("Email", 112, 62);
      doc.text("Report Date", 112, 70);

      doc.setFont("helvetica", "normal");
      doc.text(`: ${data.student.roll_no}`, 43, 54);
      doc.text(`: ${data.student.name}`, 43, 62);
      doc.text(`: ${data.student.board}-${data.student.class}`, 43, 70);
      doc.text(`: ${data.student.phone || "-"}`, 140, 54);
      doc.text(`: ${data.student.email || "-"}`, 140, 62);
      doc.text(`: ${today}`, 140, 70);

      doc.setDrawColor(210, 220, 235);
      doc.line(105, 50, 105, 76);

      drawCard(doc, 10, 86, 190, 78, "TEST PERFORMANCE (Last 5 Tests)");

      autoTable(doc, {
        startY: 98,
        margin: { left: 14 },
        tableWidth: 93,
        head: [["Test Code", "Subject", "Marks", "Total", "%"]],
        body: marks.slice(0, 5).map((m) => {
          const percent =
            m.total_marks && Number(m.total_marks) > 0
              ? (
                  (Number(m.marks_obtained) / Number(m.total_marks)) *
                  100
                ).toFixed(1)
              : "0.0";

          return [
            m.test_code,
            m.subject_name,
            m.marks_obtained,
            m.total_marks,
            `${percent}%`,
          ];
        }),
        styles: {
          fontSize: 6,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [12, 61, 145],
          textColor: [255, 255, 255],
        },
      });

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(12, 61, 145);
      doc.text("Mark Trend (%)", 145, 99, { align: "center" });

      drawMarksGraph(doc, 118, 106, 65, 38, marks);

      doc.setFillColor(240, 247, 255);
      doc.roundedRect(18, 147, 78, 10, 2, 2, "F");
      doc.setTextColor(12, 61, 145);
      doc.setFontSize(7);
      doc.text("Average Score", 30, 153);
      doc.setFontSize(10);
      doc.text(`${avgMark}%`, 78, 154);

      drawCard(doc, 10, 170, 190, 72, "ATTENDANCE SUMMARY");

      doc.setTextColor(0, 0, 0);
      drawPieChart(doc, 52, 205, 20, presentDays, absentDays);

      doc.setFontSize(7);
      doc.setTextColor(231, 76, 60);
      doc.text(`${absentDays}`, 23, 203, { align: "center" });
      doc.setFontSize(5);
      doc.text("Absent Days", 23, 208, { align: "center" });

      doc.setTextColor(39, 174, 96);
      doc.setFontSize(7);
      doc.text(`${presentDays}`, 82, 203, { align: "center" });
      doc.setFontSize(5);
      doc.text("Present Days", 82, 208, { align: "center" });

      autoTable(doc, {
        startY: 186,
        margin: { left: 105 },
        tableWidth: 45,
        head: [["Attendance Overview"]],
        body: [
          ["Total Working Days", totalDays],
          ["Present Days", presentDays],
          ["Absent Days", absentDays],
          ["Attendance %", `${attendancePercent}%`],
        ],
        styles: {
          fontSize: 6,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [12, 61, 145],
          textColor: [255, 255, 255],
        },
      });

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(12, 61, 145);
      doc.text("Attendance Trend", 174, 187, { align: "center" });

      drawAttendanceBarChart(doc, 160, 197, presentDays, absentDays);

      drawCard(doc, 10, 248, 190, 28, "REMARKS");

      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(
        "Keep up the good work and continue your consistent performance.",
        16,
        260
      );

      doc.setDrawColor(0, 0, 0);
      doc.line(160, 260, 188, 260);
      doc.setFontSize(6);
      doc.text("Principal", 174, 265, { align: "center" });
      doc.text("INTELLEKT ACADEMY", 174, 270, { align: "center" });

      doc.setFillColor(7, 48, 120);
      doc.rect(0, 286, pageW, 11, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.text("Reality Higher. Future.", 12, 293);
      doc.text("www.intellektacademy.com", pageW / 2, 293, {
        align: "center",
      });
      doc.text("+91 1234567890", 185, 293, { align: "right" });

      doc.save(`${student.roll_no}_report.pdf`);
    } catch (err) {
      console.error("Failed to download report", err);
      alert("Failed to generate report");
    }
  }

  return (
    <div className="p-6 md:p-10 min-h-screen bg-gray-50">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Student Record
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3"
          >
            <option value="">Select Class</option>

            {classes.map((cls, index) => (
              <option key={index} value={`${cls.board}-${cls.class}`}>
                {cls.board}-{cls.class}
              </option>
            ))}
          </select>

          <button
            onClick={fetchStudents}
            className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-3 font-semibold"
          >
            View Students
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-600">Loading students...</div>
      ) : students.length > 0 ? (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-4 py-3 text-left">Roll No</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {students.map((student) => (
                <tr key={student.roll_no} className="border-t">
                  <td className="px-4 py-3">{student.roll_no}</td>
                  <td className="px-4 py-3">{student.name}</td>
                  <td className="px-4 py-3">
                    {student.board}-{student.class}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => downloadReport(student)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                    >
                      Download Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500 text-center">No students found</div>
      )}
    </div>
  );
}