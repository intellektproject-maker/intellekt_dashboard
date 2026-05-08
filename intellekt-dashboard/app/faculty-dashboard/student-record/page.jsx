"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "/backend-api";

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

  async function downloadReport(student) {
    try {
      const res = await fetch(
        `${API_BASE}/student-record-report/${student.roll_no}`
      );

      const data = await res.json();

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text("INTELLEKT ACADEMY", 70, 15);

      doc.setFontSize(14);
      doc.text("Student Report", 85, 25);

      doc.setFontSize(11);

      doc.text(`Roll No : ${data.student.roll_no}`, 14, 40);
      doc.text(`Name : ${data.student.name}`, 14, 48);
      doc.text(
        `Class : ${data.student.board}-${data.student.class}`,
        14,
        56
      );
      doc.text(`Phone : ${data.student.phone || "-"}`, 14, 64);
      doc.text(`Email : ${data.student.email || "-"}`, 14, 72);

      doc.setFontSize(13);
      doc.text("Last 5 Test Marks", 14, 88);

      autoTable(doc, {
        startY: 92,
        head: [["Test Code", "Subject", "Marks", "Total"]],
        body: data.marks.map((m) => [
          m.test_code,
          m.subject_name,
          m.marks_obtained,
          m.total_marks,
        ]),
      });

      const finalY = doc.lastAutoTable.finalY + 15;

      doc.setFontSize(13);
      doc.text("Attendance Summary", 14, finalY);

      autoTable(doc, {
        startY: finalY + 5,
        head: [["Present Days", "Absent Days"]],
        body: [
          [
            data.attendance.present_days,
            data.attendance.absent_days,
          ],
        ],
      });

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
              <option
                key={index}
                value={`${cls.board}-${cls.class}`}
              >
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
        <div className="text-center text-gray-600">
          Loading students...
        </div>
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
                <tr
                  key={student.roll_no}
                  className="border-t"
                >
                  <td className="px-4 py-3">
                    {student.roll_no}
                  </td>

                  <td className="px-4 py-3">
                    {student.name}
                  </td>

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
        <div className="text-gray-500 text-center">
          No students found
        </div>
      )}
    </div>
  );
}