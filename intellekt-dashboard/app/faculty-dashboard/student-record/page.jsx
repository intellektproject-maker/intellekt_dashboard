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

  function getSubjectName(mark) {
    const subject = String(mark.subject_name || "").toLowerCase();
    const code = String(mark.test_code || "").toUpperCase();

    if (subject.includes("math") || code.includes("M")) return "Maths";
    if (subject.includes("physics") || code.includes("P")) return "Physics";

    return mark.subject_name || "-";
  }

  function getPercent(mark) {
    const obtained = Number(mark.marks_obtained);
    const total = Number(mark.total_marks);

    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) {
      return 0;
    }

    return (obtained / total) * 100;
  }

  function calculateSubjectAverage(marks, subjectName) {
    const filtered = marks.filter((m) => getSubjectName(m) === subjectName);

    if (filtered.length === 0) return "N/A";

    const total = filtered.reduce((sum, m) => sum + getPercent(m), 0);
    return `${(total / filtered.length).toFixed(2)}%`;
  }

  function drawCard(doc, x, y, w, h, title) {
    doc.setDrawColor(28, 77, 150);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2);

    doc.setFillColor(12, 61, 145);
    doc.roundedRect(x, y, 58, 7, 2, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title, x + 3, y + 5);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
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
    doc.setFont("helvetica", "bold");
    doc.text("Attendance", centerX, centerY + 5, { align: "center" });
  }

  function drawAttendanceBarChart(doc, x, y, present, absent) {
    const maxVal = Math.max(present, absent, 1);
    const barMaxHeight = 26;

    const presentH = (present / maxVal) * barMaxHeight;
    const absentH = (absent / maxVal) * barMaxHeight;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);

    doc.setFillColor(39, 174, 96);
    doc.rect(x, y + barMaxHeight - presentH, 12, presentH, "F");
    doc.text(String(present), x + 6, y + barMaxHeight - presentH - 2, {
      align: "center",
    });
    doc.text("Present", x + 6, y + barMaxHeight + 6, { align: "center" });

    doc.setFillColor(231, 76, 60);
    doc.rect(x + 30, y + barMaxHeight - absentH, 12, absentH, "F");
    doc.text(String(absent), x + 36, y + barMaxHeight - absentH - 2, {
      align: "center",
    });
    doc.text("Absent", x + 36, y + barMaxHeight + 6, { align: "center" });
  }

  function buildSubjectRows(marks, subjectName) {
    const subjectMarks = marks
      .filter((m) => getSubjectName(m) === subjectName)
      .slice(0, 5);

    if (subjectMarks.length === 0) {
      return [["No records", "-", "-", "-"]];
    }

    return subjectMarks.map((m) => [
      m.test_code || "-",
      m.marks_obtained ?? "-",
      m.total_marks ?? "-",
      `${getPercent(m).toFixed(1)}%`,
    ]);
  }

  async function downloadReport(student) {
    try {
      const res = await fetch(
        `${API_BASE}/student-record-report/${student.roll_no}`
      );

      const data = await res.json();

      const doc = new jsPDF("p", "mm", "a4");
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFont("helvetica", "bold");

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
              marks.reduce((sum, m) => sum + getPercent(m), 0) / marks.length
            ).toFixed(2)
          : "0.00";

      const mathsAvg = calculateSubjectAverage(marks, "Maths");
      const physicsAvg = calculateSubjectAverage(marks, "Physics");

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, 28, "F");

      doc.setTextColor(0, 3, 81);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("Intellekt Academy", pageW / 2, 16, {
        align: "center",
      });

      doc.setFontSize(9);
      doc.text("STUDENT REPORT", pageW / 2, 24, { align: "center" });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(6);
      doc.text(`Report Date : ${today}`, pageW / 2, 35, { align: "center" });

      drawCard(doc, 10, 42, 190, 38, "STUDENT DETAILS");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);

      doc.text("Roll No", 18, 54);
      doc.text("Name", 18, 62);
      doc.text("Class", 18, 70);

      doc.text("Phone", 112, 54);
      doc.text("Email", 112, 62);
      doc.text("Report Date", 112, 70);

      doc.text(":", 40, 54);
      doc.text(String(data.student.roll_no || "-"), 44, 54);

      doc.text(":", 40, 62);
      doc.text(String(data.student.name || "-"), 44, 62);

      doc.text(":", 40, 70);
      doc.text(
        `${data.student.board || "-"}-${data.student.class || "-"}`,
        44,
        70
      );

      doc.text(":", 137, 54);
      doc.text(String(data.student.phone || "-"), 141, 54);

      doc.text(":", 137, 62);
      doc.text(String(data.student.email || "-"), 141, 62);

      doc.text(":", 137, 70);
      doc.text(today, 141, 70);

      doc.setDrawColor(210, 220, 235);
      doc.line(105, 50, 105, 76);

      drawCard(doc, 10, 86, 190, 78, "TEST PERFORMANCE");

      doc.setTextColor(12, 61, 145);
      doc.setFontSize(7);
      doc.text(`Overall Average : ${avgMark}%`, 105, 96, {
        align: "center",
      });

      doc.text(`Maths Avg : ${mathsAvg}`, 55, 103, {
        align: "center",
      });

      doc.text(`Physics Avg : ${physicsAvg}`, 155, 103, {
        align: "center",
      });

      autoTable(doc, {
        startY: 108,
        margin: { left: 14 },
        tableWidth: 84,
        head: [["Maths", "Marks", "Total", "%"]],
        body: buildSubjectRows(marks, "Maths"),
        styles: {
          fontSize: 6,
          cellPadding: 2,
          halign: "center",
          valign: "middle",
          fontStyle: "bold",
        },
        headStyles: {
          fillColor: [12, 61, 145],
          textColor: [255, 255, 255],
          halign: "center",
          fontStyle: "bold",
        },
        bodyStyles: {
          fontStyle: "bold",
        },
      });

      autoTable(doc, {
        startY: 108,
        margin: { left: 112 },
        tableWidth: 84,
        head: [["Physics", "Marks", "Total", "%"]],
        body: buildSubjectRows(marks, "Physics"),
        styles: {
          fontSize: 6,
          cellPadding: 2,
          halign: "center",
          valign: "middle",
          fontStyle: "bold",
        },
        headStyles: {
          fillColor: [12, 61, 145],
          textColor: [255, 255, 255],
          halign: "center",
          fontStyle: "bold",
        },
        bodyStyles: {
          fontStyle: "bold",
        },
      });

      drawCard(doc, 10, 170, 190, 72, "ATTENDANCE SUMMARY");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(12, 61, 145);
      doc.text("Attendance Percentage", 55, 187, { align: "center" });

      drawPieChart(doc, 55, 210, 20, presentDays, absentDays);

      doc.setFontSize(7);
      doc.setTextColor(231, 76, 60);
      doc.text(`${absentDays}`, 24, 207, { align: "center" });

      doc.setFontSize(5);
      doc.text("Absent Days", 24, 212, { align: "center" });

      doc.setTextColor(39, 174, 96);
      doc.setFontSize(7);
      doc.text(`${presentDays}`, 86, 207, { align: "center" });

      doc.setFontSize(5);
      doc.text("Present Days", 86, 212, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(12, 61, 145);
      doc.text("Attendance Trend", 150, 187, { align: "center" });

 drawAttendanceBarChart(doc, 128, 195, presentDays, absentDays);

doc.setFont("helvetica", "bold");
doc.setFontSize(6);
doc.setTextColor(0, 0, 0);

doc.text(`Total Working Days : ${totalDays}`, 150, 235, {
  align: "center",
});
doc.text(`Attendance % : ${attendancePercent}%`, 150, 240, {
  align: "center",
});

      drawCard(doc, 10, 248, 190, 28, "REMARKS");

      doc.setDrawColor(0, 0, 0);
      doc.line(158, 262, 190, 262);

      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Signature", 174, 267, { align: "center" });
      doc.text("INTELLEKT ACADEMY", 174, 272, { align: "center" });

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